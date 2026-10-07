import { AIChatAgent, type ChatResponseResult } from "@cloudflare/ai-chat";
import type { Connection, ConnectionContext, WSMessage } from "agents";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type LanguageModel,
  type LanguageModelUsage,
  type UIMessageStreamWriter
} from "ai";
import { z } from "zod";

import { deepseek, isInsufficientBalance, jarvisCall } from "./ai";
import { globalLimiter } from "./api/ratelimit";
import { readAsset } from "./api/store";
import { contactMailer, sendOpportunityEmail } from "./email";
import { fetchSitePage } from "./fetch-page";
import { jsonString, lenient } from "#utils/json.ts";
import { messageText } from "#utils/ui-message.ts";
import { buildMessages, jarvisTools, ROOM_DAILY_LIMIT, type Lead } from "./prompt";
import {
  ERROR_NOTICE,
  LIMIT_NOTICE,
  MAX_MESSAGE_LENGTH,
  type Activity,
  type ChatHistoryEntry,
  type JarvisMessage,
  type Notice
} from "#contracts/chat.ts";
import { parseVisitorContext } from "./visitor";

const DAY_MS = 24 * 60 * 60 * 1000;

type CountRow = { n: number };

const UNREADABLE = "Sorry, I couldn't read that message.";

// Frames that can't start a model call or touch stored messages, passed through as sent.
const PASSTHROUGH_FRAMES = new Set([
  "cf_agent_stream_resume_request",
  "cf_agent_stream_resume_ack",
  "cf_agent_chat_request_cancel"
]);

const FrameType = jsonString(z.looseObject({ type: z.string(), id: lenient(z.string()) }));

const ChatRequest = jsonString(
  z.object({
    type: z.literal("cf_agent_use_chat_request"),
    id: z.string().min(1).max(100),
    init: z.object({
      method: z.literal("POST"),
      body: jsonString(
        z.object({
          // Only the newest message is read; the room's stored history replaces the rest.
          messages: z.array(z.unknown()).min(1),
          trigger: z.literal("submit-message"),
          // The visitor's current site path; never persisted. A malformed one is dropped.
          page: lenient(z.string().regex(/^\/[^\s]{0,199}$/))
        })
      )
    })
  })
);

const UserMessage = z.object({
  id: z.string().min(1).max(100),
  role: z.literal("user"),
  parts: z.tuple([
    z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) })
  ])
});

const RequestBody = z.object({ page: lenient(z.string()) });

// Keeps spend visible in the Worker logs, one line per model call.
function logUsage(usage: LanguageModelUsage): void {
  console.log(
    "deepseek usage",
    JSON.stringify({ promptTokens: usage.inputTokens, completionTokens: usage.outputTokens })
  );
}

function noticeResponse(notice: Notice): Response {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream<JarvisMessage>({
      execute: ({ writer }) => writer.write({ type: "data-notice", data: notice })
    })
  });
}

export class ChatRoom extends AIChatAgent<Env> {
  maxPersistedMessages = 200;
  // A message sent while a turn runs (another tab, say) is refused, so turns never interleave.
  messageConcurrency = "drop" as const;

  // Public so tests can drive `ctx.storage.sql` via `runInDurableObject`.
  declare public ctx: DurableObjectState<Record<string, unknown>>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // AIChatAgent trusts the client's whole transcript: it persists whatever
    // history a frame carries and runs turns for tool results. Its handler is an
    // instance property, so wrapping it here sees every frame first.
    const handle = this.onMessage.bind(this);
    this.onMessage = (connection, message) => {
      const frame = this.admit(connection, message);
      return frame === null ? undefined : handle(connection, frame);
    };
  }

  // Lets through a new visitor message, rebased on the stored history, and the
  // resume and cancel frames. Everything else is dropped.
  private admit(connection: Connection, message: WSMessage): string | null {
    if (typeof message !== "string") return null;
    const frame = FrameType.safeParse(message).data;
    if (!frame) return null;
    if (PASSTHROUGH_FRAMES.has(frame.type)) return message;
    if (frame.type !== "cf_agent_use_chat_request") return null;

    const request = ChatRequest.safeParse(message).data;
    const { messages, page } = request?.init.body ?? {};
    const latest = UserMessage.safeParse(messages?.at(-1)).data;
    if (!request || !latest || this.messages.some(m => m.id === latest.id)) {
      if (frame.id) this.rejectRequest(connection, frame.id);
      return null;
    }
    return JSON.stringify({
      type: request.type,
      id: request.id,
      init: {
        method: "POST",
        body: JSON.stringify({
          messages: [...this.messages, latest],
          trigger: "submit-message",
          page
        })
      }
    });
  }

  private rejectRequest(connection: Connection, id: string): void {
    connection.send(
      JSON.stringify({
        type: "cf_agent_use_chat_response",
        id,
        body: UNREADABLE,
        done: true,
        error: true
      })
    );
  }

  onStart(): void {
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS user_messages (created_at INTEGER NOT NULL);
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

  onConnect(_connection: Connection, ctx: ConnectionContext): void {
    this.recordVisitor(ctx.request);
  }

  // An interrupted turn is dropped rather than retried, since a retry bills the model again.
  async onChatRecovery(): Promise<{ continue: false }> {
    return { continue: false };
  }

  async onChatMessage(
    _onFinish: unknown,
    options?: { abortSignal?: AbortSignal; body?: Record<string, unknown> }
  ): Promise<Response> {
    try {
      // A missing key gates like an empty account; the visitor can't fix either.
      const key = this.deepseekKey();
      if (
        this.userMessagesSince(Date.now() - DAY_MS) >= ROOM_DAILY_LIMIT ||
        !key ||
        !(await globalLimiter(this.env).chatAvailable(key))
      ) {
        return noticeResponse(LIMIT_NOTICE);
      }
      this.recordUserMessage();

      const { page } = RequestBody.parse(options?.body ?? {});
      return createUIMessageStreamResponse({
        stream: createUIMessageStream<JarvisMessage>({
          execute: ({ writer }) =>
            this.reply({ writer, key, page, abortSignal: options?.abortSignal })
        })
      });
    } catch (err) {
      console.error("chat turn failed", err);
      return noticeResponse(ERROR_NOTICE);
    }
  }

  protected onChatResponse({ message }: ChatResponseResult): void {
    const content = messageText(message);
    if (content) this.mirrorMessage("assistant", content);
  }

  // One reply through the AI SDK tool loop. Only prose and the running tool's
  // name reach the client: tool inputs hold contact details, and outputs hold whole pages.
  private async reply({
    writer,
    key,
    page,
    abortSignal
  }: {
    writer: UIMessageStreamWriter<JarvisMessage>;
    key: string;
    page?: string;
    abortSignal?: AbortSignal;
  }): Promise<void> {
    writer.write({ type: "start" });
    let wroteText = false;
    let failure: Notice | null = null;
    try {
      // Root llms.txt (~900 tokens) lists every post with its title, summary and link.
      // blog/llms-full.txt costs ~20x the tokens and grows per post.
      const grounding = (await readAsset(this.env.ASSETS, "/llms.txt")) ?? "";
      const result = streamText({
        ...jarvisCall({
          model: this.languageModel(key),
          messages: buildMessages(grounding, this.history(), page),
          tools: jarvisTools({
            fetchPage: url => fetchSitePage(this.env.ASSETS, url),
            captureLead: lead => this.captureLead(lead)
          })
        }),
        abortSignal
      });
      for await (const part of result.stream) {
        if (part.type === "text-start") {
          writer.write({ type: "text-start", id: part.id });
        } else if (part.type === "text-delta") {
          wroteText ||= part.text.trim() !== "";
          writer.write({ type: "text-delta", id: part.id, delta: part.text });
        } else if (part.type === "text-end") {
          writer.write({ type: "text-end", id: part.id });
        } else if (part.type === "tool-call" && !part.dynamic) {
          // Sent as the call is parsed, before its tool runs: a page fetch is a turn's longest silence.
          writer.write({
            type: "data-activity",
            data:
              part.toolName === "fetch_page"
                ? fetchActivity(part.input.url)
                : { name: "capture_opportunity" }
          });
        } else if (part.type === "finish-step") {
          logUsage(part.usage);
        } else if (part.type === "error") {
          throw part.error;
        }
      }
    } catch (err) {
      console.error("chat generation failed", err);
      // A 402 beats the cached balance, so gate every room until the next check.
      const exhausted = isInsufficientBalance(err);
      if (exhausted) await globalLimiter(this.env).markChatExhausted();
      failure = exhausted ? LIMIT_NOTICE : ERROR_NOTICE;
    }
    // Every turn ends in prose or a notice; the widget waits for one or the other.
    // A cancelled turn ends quietly.
    const notice = abortSignal?.aborted ? null : (failure ?? (wroteText ? null : ERROR_NOTICE));
    if (notice) writer.write({ type: "data-notice", data: notice });
    writer.write({ type: "finish" });
  }

  // Tests swap in a scripted model here.
  protected languageModel(key: string): LanguageModel {
    return deepseek({ apiKey: key });
  }

  // Typed required (secrets.required gates deploy), but local dev may lack it.
  private deepseekKey(): string | null {
    return this.env.DEEPSEEK_API_KEY?.trim() || null;
  }

  private async captureLead(lead: Lead): Promise<void> {
    this.storeLead(lead);
    await this.emailLeadOnce(lead);
  }

  private async emailLeadOnce(lead: Lead): Promise<void> {
    if (this.metaValue("lead_captured") !== null) return;
    const mailer = contactMailer(this.env);
    if (!mailer) {
      console.error("opportunity email skipped: no EMAIL binding or inbox");
      return;
    }
    // Claimed before the send: two captures in one step run in parallel.
    this.upsertMeta("lead_captured", new Date().toISOString());
    try {
      await sendOpportunityEmail({
        ...mailer,
        lead,
        transcript: this.history()
      });
    } catch (err) {
      // Lead is already in SQLite; losing the email must not kill the chat.
      console.error("opportunity email failed", err);
      this.ctx.storage.sql.exec(`DELETE FROM meta WHERE key = 'lead_captured'`);
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
    return this.messages.flatMap(message => {
      const content = messageText(message);
      return content && (message.role === "user" || message.role === "assistant")
        ? [{ role: message.role, content }]
        : [];
    });
  }

  private userMessagesSince(cutoff: number): number {
    return this.ctx.storage.sql
      .exec<CountRow>(`SELECT COUNT(*) AS n FROM user_messages WHERE created_at > ?`, cutoff)
      .one().n;
  }

  // Counts the visitor's newest message toward the room's daily limit and mirrors it to D1.
  private recordUserMessage(): void {
    this.ctx.storage.sql.exec(`INSERT INTO user_messages (created_at) VALUES (?)`, Date.now());
    const latest = this.messages.filter(m => m.role === "user").at(-1);
    if (latest) this.mirrorMessage("user", messageText(latest));
  }

  private mirrorMessage(role: "user" | "assistant", content: string): void {
    this.mirrorToD1(
      this.env.CHAT_DB?.prepare(
        `INSERT INTO messages (room_id, role, content, created_at) VALUES (?, ?, ?, ?)`
      ).bind(this.name, role, content, Date.now())
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
}

// Only a page fetch has a detail. A capture's input is the visitor's name and contact details.
export function fetchActivity(url: string): Activity {
  try {
    return { name: "fetch_page", detail: new URL(url).pathname };
  } catch {
    return { name: "fetch_page" };
  }
}
