import { Server, type Connection, type ConnectionContext } from "partyserver";
import { z } from "zod";

import { isInsufficientBalance, runDeepseekExchange } from "./ai";
import { globalLimiter } from "./api/ratelimit";
import { contactMailer, parseLeadArguments, sendOpportunityEmail, type Lead } from "./email";
import { fetchSitePage } from "./fetch-page";
import { getGrounding } from "./grounding";
import { jsonString, lenient } from "#utils/json.ts";
import { buildMessages, parseFetchArguments, ROOM_DAILY_LIMIT, type ModelMessage } from "./prompt";
import type { StreamResult, ToolCall } from "./sse";
import {
  GREETING,
  MAX_MESSAGE_LENGTH,
  parseVisitorContext,
  toolFrame,
  type ChatHistoryEntry,
  type ServerMessage
} from "./protocol";

const PAGE_PATH = /^\/[^\s]{0,199}$/;

const ClientMessage = jsonString(
  z.object({
    type: z.literal("chat"),
    text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
    // The visitor's current site path; never persisted. A malformed one is dropped, not rejected.
    page: lenient(z.string().regex(PAGE_PATH))
  })
);

type ClientMessage = z.infer<typeof ClientMessage>;

export const parseClientMessage = (raw: unknown): ClientMessage | null =>
  ClientMessage.safeParse(raw).data ?? null;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_FETCH_ROUNDS = 2;

type CountRow = { n: number };

const LIMIT_MESSAGE =
  "I've hit my chat budget for now. Please reach Murugappan directly " +
  "through the social links on this site instead.";

// Strict OpenAI shape, an assistant message with tool_calls followed by a tool
// message, so any provider accepts it.
function toolExchange({
  call,
  content,
  result
}: {
  call: ToolCall;
  content: string;
  result: string;
}): ModelMessage[] {
  return [
    {
      role: "assistant",
      content,
      tool_calls: [
        { id: call.id, type: "function", function: { name: call.name, arguments: call.arguments } }
      ]
    },
    { role: "tool", tool_call_id: call.id, content: result }
  ];
}

export class ChatRoom extends Server<Env> {
  static options = { hibernate: true };

  // Public so tests can drive `ctx.storage.sql` via `runInDurableObject`.
  declare public ctx: DurableObjectState<Record<string, unknown>>;

  onStart(): void {
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         role TEXT NOT NULL,
         content TEXT NOT NULL,
         created_at INTEGER NOT NULL
       );
       CREATE TABLE IF NOT EXISTS leads (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT,
         contact TEXT NOT NULL,
         summary TEXT NOT NULL,
         created_at INTEGER NOT NULL
       );
       CREATE TABLE IF NOT EXISTS meta (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL
       );`
    );
  }

  onConnect(connection: Connection, ctx: ConnectionContext): void {
    // Synchronous check-and-insert, so the greeting can't be seeded twice.
    const { n } = this.ctx.storage.sql.exec<CountRow>(`SELECT COUNT(*) AS n FROM messages`).one();
    if (n === 0) this.persist("assistant", GREETING);
    this.recordVisitor(ctx.request);
    this.send(connection, { type: "history", messages: this.history() });
  }

  // Serializes turns: concurrent tabs would otherwise interleave across awaits
  // and garble the broadcast stream.
  private pendingTurn: Promise<void> = Promise.resolve();

  async onMessage(connection: Connection, raw: unknown): Promise<void> {
    const msg = parseClientMessage(raw);
    if (!msg) {
      this.send(connection, {
        type: "error",
        message: "Sorry, I couldn't read that message."
      });
      return;
    }

    const turn = this.pendingTurn.then(() => this.handleTurn(connection, msg));
    this.pendingTurn = turn.catch(() => {});
    await turn;
  }

  private async handleTurn(connection: Connection, msg: ClientMessage): Promise<void> {
    // A missing key gates like an empty account; the visitor can't fix either.
    const key = this.deepseekKey();
    if (
      this.userMessagesSince(Date.now() - DAY_MS) >= ROOM_DAILY_LIMIT ||
      !key ||
      !(await globalLimiter(this.env).chatAvailable(key))
    ) {
      this.send(connection, { type: "limit", message: LIMIT_MESSAGE });
      return;
    }

    this.persist("user", msg.text);
    // The sender already rendered its bubble optimistically.
    this.broadcastMsg({ type: "visitor", text: msg.text }, [connection.id]);

    try {
      await this.generate(key, msg.page);
    } catch (err) {
      console.error("chat generation failed", err);
      // A 402 beats the cached balance, so gate every room until the next check.
      if (isInsufficientBalance(err)) {
        await globalLimiter(this.env).markChatExhausted();
        this.send(connection, { type: "limit", message: LIMIT_MESSAGE });
        return;
      }
      this.send(connection, {
        type: "error",
        message: "Something went wrong on my end. Please try again."
      });
    }
  }

  // One reply turn: up to MAX_FETCH_ROUNDS fetch_page rounds, an optional
  // capture exchange, then persist. Everything is broadcast to the room.
  private async generate(key: string, page?: string): Promise<void> {
    const onDelta = (text: string) => this.broadcastMsg({ type: "delta", text });
    const grounding = await getGrounding(this.ctx.storage, this.env.ASSETS);
    const messages = buildMessages(grounding, this.history(), page);

    let reply = "";
    let capture: ToolCall | undefined;
    for (let round = 0; ; round++) {
      const result = await this.exchange(key, messages, onDelta);
      reply += result.content;
      capture ??= result.toolCalls.find(t => t.name === "capture_opportunity");

      const fetchCall = result.toolCalls.find(t => t.name === "fetch_page");
      if (!fetchCall || round >= MAX_FETCH_ROUNDS) break;

      const url = parseFetchArguments(fetchCall.arguments);
      // Announce before the await, since fetch plus follow-up is a turn's longest silence.
      this.broadcastMsg(toolFrame("fetch_page", url));
      const pageText = url
        ? await fetchSitePage(this.env.ASSETS, url)
        : "The url argument was missing.";
      messages.push(
        ...toolExchange({ call: fetchCall, content: result.content, result: pageText })
      );
    }

    if (capture) {
      if (reply) this.broadcastMsg({ type: "delta", text: "\n" });
      const followUp = await this.handleCapture(capture, key, onDelta);
      reply = reply && followUp ? `${reply}\n${followUp}` : reply || followUp;
    }

    // Collapse stray blank lines left between exchanges.
    reply = reply.replace(/\n{3,}/g, "\n\n").trim();
    if (reply) this.persist("assistant", reply);
    this.broadcastMsg({ type: "done" });
  }

  private async exchange(
    key: string,
    messages: ModelMessage[],
    onDelta: (text: string) => void
  ): Promise<StreamResult> {
    const result = await runDeepseekExchange({ apiKey: key, messages, onDelta });
    // Keeps spend visible in the Worker logs.
    console.log("deepseek usage", JSON.stringify(result.usage));
    return result;
  }

  // Typed required (secrets.required gates deploy), but local dev may lack it.
  private deepseekKey(): string | null {
    return this.env.DEEPSEEK_API_KEY?.trim() || null;
  }

  // Stores the lead, emails once per room, and has the model phrase the
  // confirmation.
  private async handleCapture(
    capture: ToolCall,
    key: string,
    onDelta: (text: string) => void
  ): Promise<string> {
    const lead = parseLeadArguments(capture.arguments);
    if (!lead) return "";

    this.broadcastMsg(toolFrame("capture_opportunity"));
    this.storeLead(lead);
    await this.emailLeadOnce(lead);

    const grounding = await getGrounding(this.ctx.storage, this.env.ASSETS);
    const followUp = await this.exchange(
      key,
      [
        ...buildMessages(grounding, this.history()),
        ...toolExchange({
          call: capture,
          content: "",
          result: JSON.stringify({
            status: "recorded",
            note: "Murugappan will be notified by email."
          })
        })
      ],
      onDelta
    );
    return followUp.content;
  }

  private async emailLeadOnce(lead: Lead): Promise<void> {
    if (this.metaValue("lead_captured") !== null) return;
    const mailer = contactMailer(this.env);
    if (!mailer) {
      console.error("opportunity email skipped: no EMAIL binding or inbox");
      return;
    }
    try {
      await sendOpportunityEmail({
        ...mailer,
        lead,
        transcript: this.history()
      });
      this.ctx.storage.sql.exec(
        `INSERT INTO meta (key, value) VALUES ('lead_captured', ?)`,
        new Date().toISOString()
      );
    } catch (err) {
      // Lead is already in SQLite; losing the email must not kill the chat.
      console.error("opportunity email failed", err);
    }
  }

  // Stored under `visitor_*` meta keys and mirrored to one D1 `rooms` row.
  // A missing value never erases a known one.
  private recordVisitor(request: Request): void {
    const visitor = parseVisitorContext(request.headers);
    if (!visitor) return;

    const now = Date.now();
    const knownFirstSeen = this.metaValue("visitor_first_seen");
    const firstSeen = knownFirstSeen === null ? now : Number(knownFirstSeen);

    this.upsertMeta("visitor_country", visitor.country);
    this.upsertMeta("visitor_ip", visitor.ip);
    this.upsertMeta("visitor_last_seen", String(now));
    if (knownFirstSeen === null) this.upsertMeta("visitor_first_seen", String(now));

    this.mirrorToD1(
      this.env.CHAT_DB?.prepare(
        `INSERT INTO rooms (room_id, country, ip, first_seen, last_seen)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (room_id) DO UPDATE SET
           country = COALESCE(excluded.country, rooms.country),
           ip = COALESCE(excluded.ip, rooms.ip),
           last_seen = excluded.last_seen`
      ).bind(this.name, visitor.country, visitor.ip, firstSeen, now)
    );
  }

  private metaValue(key: string): string | null {
    const rows = this.ctx.storage.sql
      .exec<{ value: string }>(`SELECT value FROM meta WHERE key = ?`, key)
      .toArray();
    return rows.length ? rows[0].value : null;
  }

  private upsertMeta(key: string, value: string | null): void {
    if (value === null) return;
    this.ctx.storage.sql.exec(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      key,
      value
    );
  }

  private storeLead(lead: Lead): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO leads (name, contact, summary, created_at) VALUES (?, ?, ?, ?)`,
      lead.name ?? null,
      lead.contact,
      lead.summary,
      Date.now()
    );
  }

  private history(): ChatHistoryEntry[] {
    return this.ctx.storage.sql
      .exec<ChatHistoryEntry>(`SELECT role, content FROM messages ORDER BY id ASC`)
      .toArray();
  }

  private userMessagesSince(cutoff: number): number {
    return this.ctx.storage.sql
      .exec<CountRow>(
        `SELECT COUNT(*) AS n FROM messages WHERE role = 'user' AND created_at > ?`,
        cutoff
      )
      .one().n;
  }

  private persist(role: "user" | "assistant", content: string): void {
    const createdAt = Date.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)`,
      role,
      content,
      createdAt
    );
    this.mirrorToD1(
      this.env.CHAT_DB?.prepare(
        `INSERT INTO messages (room_id, role, content, created_at) VALUES (?, ?, ?, ?)`
      ).bind(this.name, role, content, createdAt)
    );
  }

  // D1 is the only global view (rooms aren't enumerable) but the DO's SQLite is the
  // source of truth, so the write is fire-and-forget; waitUntil holds off eviction.
  private mirrorToD1(statement: D1PreparedStatement | undefined): void {
    if (!statement) return;
    this.ctx.waitUntil(
      statement.run().catch((err: unknown) => console.error("d1 mirror failed", err))
    );
  }

  private broadcastMsg(message: ServerMessage, exclude?: string[]): void {
    this.broadcast(JSON.stringify(message), exclude);
  }

  private send(connection: Connection, message: ServerMessage): void {
    connection.send(JSON.stringify(message));
  }
}
