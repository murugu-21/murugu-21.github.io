import { Server, type Connection, type ConnectionContext } from "partyserver";

import { isInsufficientBalance, runDeepseekExchange } from "./ai";
import { parseLeadArguments, sendOpportunityEmail, type Lead } from "./email";
import { fetchSitePage } from "./fetch-page";
import { getGrounding } from "./grounding";
import { buildMessages, parseFetchArguments, ROOM_DAILY_LIMIT, type ModelMessage } from "./prompt";
import { type StreamResult } from "./sse";
import {
  GREETING,
  parseClientMessage,
  parseVisitorContext,
  toolFrame,
  type ChatHistoryEntry,
  type ServerMessage
} from "./protocol";

const DAY_MS = 24 * 60 * 60 * 1000;

const LIMIT_MESSAGE =
  "I've hit my chat budget for now — please reach Murugappan directly " +
  "through the social links on this site instead.";

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
    const count = this.ctx.storage.sql.exec(`SELECT COUNT(*) AS n FROM messages`).one().n as number;
    if (count === 0) this.persist("assistant", GREETING);
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

  private async handleTurn(
    connection: Connection,
    msg: { text: string; page?: string }
  ): Promise<void> {
    if (this.userMessagesSince(Date.now() - DAY_MS) >= ROOM_DAILY_LIMIT) {
      this.send(connection, { type: "limit", message: LIMIT_MESSAGE });
      return;
    }
    // A missing key gates like an empty account; the visitor can't fix either.
    const key = this.deepseekKey();
    if (!key || !(await this.limiter().chatAvailable(key))) {
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
      // A 402 beats the cached balance: gate every room until the next check.
      if (isInsufficientBalance(err)) {
        await this.limiter().markChatExhausted();
        this.send(connection, { type: "limit", message: LIMIT_MESSAGE });
        return;
      }
      this.send(connection, {
        type: "error",
        message: "Something went wrong on my end — please try again."
      });
    }
  }

  // One reply turn: exchange with up to MAX_FETCH_ROUNDS fetch_page rounds, an
  // optional capture exchange, then persist. Everything is broadcast to the room.
  private async generate(key: string, page?: string): Promise<void> {
    const onDelta = (text: string) => this.broadcastMsg({ type: "delta", text });
    const grounding = await getGrounding(this.ctx.storage, this.env.ASSETS);
    const messages: ModelMessage[] = buildMessages(grounding, this.history(), page);

    const MAX_FETCH_ROUNDS = 2;
    let reply = "";
    let capture: { id: string; name: string; arguments: string } | undefined;
    for (let round = 0; ; round++) {
      const result = await this.exchange(key, messages, onDelta);
      reply += result.content;
      capture ??= result.toolCalls.find(t => t.name === "capture_opportunity");

      const fetchCall = result.toolCalls.find(t => t.name === "fetch_page");
      if (!fetchCall || round >= MAX_FETCH_ROUNDS) break;

      const url = parseFetchArguments(fetchCall.arguments);
      // Announce before the await: fetch plus follow-up is a turn's longest silence.
      this.broadcastMsg(toolFrame("fetch_page", url));
      const pageText = url
        ? await fetchSitePage(this.env.ASSETS, url)
        : "The url argument was missing.";
      messages.push(
        {
          role: "assistant",
          content: result.content,
          tool_calls: [
            {
              id: fetchCall.id,
              type: "function",
              function: { name: fetchCall.name, arguments: fetchCall.arguments }
            }
          ]
        },
        { role: "tool", tool_call_id: fetchCall.id, content: pageText }
      );
    }

    if (capture) {
      if (reply) this.broadcastMsg({ type: "delta", text: "\n" });
      const followUp = await this.handleCapture(capture, key, onDelta);
      reply = [reply, followUp].filter(Boolean).join(reply ? "\n" : "");
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
    const result = await runDeepseekExchange(key, messages, onDelta);
    // Keeps spend visible in `wrangler tail`.
    console.log("deepseek usage", JSON.stringify(result.usage));
    return result;
  }

  // Typed non-optional, but a deploy can lack the secret and `.dev.vars` holds
  // a placeholder.
  private deepseekKey(): string | null {
    const trimmed = (this.env.DEEPSEEK_API_KEY as string | undefined)?.trim();
    return trimmed && !trimmed.startsWith("placeholder") ? trimmed : null;
  }

  // Stores the lead, emails once per room, and has the model phrase the
  // confirmation.
  private async handleCapture(
    capture: { id: string; name: string; arguments: string },
    key: string,
    onDelta: (text: string) => void
  ): Promise<string> {
    const lead = parseLeadArguments(capture.arguments);
    if (!lead) return "";

    this.broadcastMsg(toolFrame("capture_opportunity"));
    this.storeLead(lead);

    const alreadyCaptured = this.ctx.storage.sql
      .exec(`SELECT value FROM meta WHERE key = 'lead_captured'`)
      .toArray();
    if (alreadyCaptured.length === 0) {
      try {
        await sendOpportunityEmail(
          this.env.EMAIL as unknown as Parameters<typeof sendOpportunityEmail>[0],
          this.env.OPPORTUNITY_INBOX,
          lead,
          this.history()
        );
        this.ctx.storage.sql.exec(
          `INSERT INTO meta (key, value) VALUES ('lead_captured', ?)`,
          new Date().toISOString()
        );
      } catch (err) {
        // Lead is already in SQLite; losing the email must not kill the chat.
        console.error("opportunity email failed", err);
      }
    }

    // Strict OpenAI shape (assistant.tool_calls → tool) so any provider accepts it.
    const grounding = await getGrounding(this.ctx.storage, this.env.ASSETS);
    const followUp = await this.exchange(
      key,
      [
        ...buildMessages(grounding, this.history()),
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: capture.id,
              type: "function",
              function: {
                name: capture.name,
                arguments: capture.arguments
              }
            }
          ]
        },
        {
          role: "tool",
          tool_call_id: capture.id,
          content: JSON.stringify({
            status: "recorded",
            note: "Murugappan will be notified by email."
          })
        }
      ],
      onDelta
    );
    return followUp.content;
  }

  private limiter() {
    return this.env.RateLimiter.get(this.env.RateLimiter.idFromName("global"));
  }

  // Stored under `visitor_*` meta keys and mirrored to one D1 `rooms` row.
  // A missing value never erases a known one.
  private recordVisitor(request: Request): void {
    const visitor = parseVisitorContext(request.headers);
    if (!visitor) return;

    const now = Date.now();
    const existing = this.ctx.storage.sql
      .exec(`SELECT value FROM meta WHERE key = 'visitor_first_seen'`)
      .toArray();
    const firstSeen = existing.length ? Number(existing[0].value) : now;

    this.upsertMeta("visitor_country", visitor.country);
    this.upsertMeta("visitor_ip", visitor.ip);
    this.upsertMeta("visitor_last_seen", String(now));
    if (!existing.length) this.upsertMeta("visitor_first_seen", String(now));

    this.env.CHAT_DB?.prepare(
      `INSERT INTO rooms (room_id, country, ip, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (room_id) DO UPDATE SET
         country = COALESCE(excluded.country, rooms.country),
         ip = COALESCE(excluded.ip, rooms.ip),
         last_seen = excluded.last_seen`
    )
      .bind(this.name, visitor.country, visitor.ip, firstSeen, now)
      .run()
      .catch((err: unknown) => console.error("d1 mirror failed", err));
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
      .exec(`SELECT role, content FROM messages ORDER BY id ASC`)
      .toArray()
      .map(r => ({
        role: r.role as "user" | "assistant",
        content: r.content as string
      }));
  }

  private userMessagesSince(cutoff: number): number {
    const row = this.ctx.storage.sql
      .exec(`SELECT COUNT(*) AS n FROM messages WHERE role = 'user' AND created_at > ?`, cutoff)
      .one();
    return row.n as number;
  }

  private persist(role: "user" | "assistant", content: string): void {
    const createdAt = Date.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)`,
      role,
      content,
      createdAt
    );
    // Fire-and-forget D1 mirror: rooms aren't enumerable, so it is the only
    // global view. The DO's SQLite stays the source of truth.
    this.env.CHAT_DB?.prepare(
      `INSERT INTO messages (room_id, role, content, created_at) VALUES (?, ?, ?, ?)`
    )
      .bind(this.name, role, content, createdAt)
      .run()
      .catch((err: unknown) => console.error("d1 mirror failed", err));
  }

  private broadcastMsg(message: ServerMessage, exclude?: string[]): void {
    this.broadcast(JSON.stringify(message), exclude);
  }

  private send(connection: Connection, message: ServerMessage): void {
    connection.send(JSON.stringify(message));
  }
}
