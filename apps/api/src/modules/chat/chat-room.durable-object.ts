import {
  AIChatAgent,
  type ChatResponseResult,
  type OnChatMessageOptions
} from "@cloudflare/ai-chat";
import type { DurableObject } from "cloudflare:workers";
import { getCurrentAgent, type Connection, type ConnectionContext } from "agents";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type TextStreamPart,
  type LanguageModel,
  type InferUIMessageChunk,
  type LanguageModelUsage,
  type UIMessageStreamWriter
} from "ai";
import { z } from "zod";

import {
  ERROR_NOTICE,
  LIMIT_NOTICE,
  type Activity,
  type ChatHistoryEntry,
  type JarvisMessage,
  type Notice
} from "@murugappan/contracts/chat.ts";
import { lenient } from "@murugappan/utils/json.ts";
import { messageText } from "@murugappan/utils/ui-message.ts";
import { LLMS_TXT } from "#src/common/content.ts";
import { admitFrame } from "#src/modules/chat/chat-frames.ts";
import { deepseek, isInsufficientBalance, jarvisCall } from "#src/modules/chat/deepseek.client.ts";
import { fetchSitePage } from "#src/modules/chat/fetch-page.client.ts";
import { buildMessages, jarvisTools, type Lead } from "#src/modules/chat/prompt.ts";
import {
  CONVERSATION_RETENTION_MS,
  parseVisitorContext,
  type VisitorContext
} from "#src/modules/chat/visitor.ts";
import { contactMailer, sendOpportunityEmail } from "#src/modules/mail/mail.client.ts";
import { globalLimiter } from "#src/modules/rate-limit/rate-limiter.client.ts";
import { parseVisitor, UNKNOWN_VISITOR, VisitorKey } from "#src/modules/rate-limit/visitor-key.ts";

const UNREADABLE = "Sorry, I couldn't read that message.";

// Rounded up to a whole second: the scheduler rounds down, which would fire the expiry early.
function expiryTime(lastSeen: number): number {
  return Math.ceil((lastSeen + CONVERSATION_RETENTION_MS) / 1000) * 1000;
}

const RequestBody = z.object({ page: lenient(z.string()) });
const Timestamp = z.number();
const ConnectionVisitor = z.object({ visitor: VisitorKey });

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

type TurnCall = {
  writer: UIMessageStreamWriter<JarvisMessage>;
  key: string;
  page?: string;
  abortSignal?: AbortSignal;
};

function streamChunk(
  part: TextStreamPart<ReturnType<typeof jarvisTools>>
): InferUIMessageChunk<JarvisMessage> | null {
  if (part.type === "text-start") return { type: "text-start", id: part.id };
  if (part.type === "text-delta") return { type: "text-delta", id: part.id, delta: part.text };
  if (part.type === "text-end") return { type: "text-end", id: part.id };
  if (part.type !== "tool-call" || part.dynamic) return null;
  return {
    type: "data-activity",
    data:
      part.toolName === "fetch_page"
        ? fetchActivity(part.input.url)
        : { name: "capture_opportunity" }
  };
}

export class ChatRoom extends AIChatAgent<Env> {
  public maxPersistedMessages = 200;
  public messageConcurrency = "drop" as const;

  // Public so tests can drive `ctx.storage.sql` and wrap the room's own bindings via
  // `runInDurableObject`.
  declare public ctx: DurableObject<Env>["ctx"];
  declare public env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // The handler is an instance property, so wrapping it here sees every frame first.
    const handle = this.onMessage.bind(this);
    this.onMessage = (connection, message) => {
      const admission = admitFrame({ message, stored: this.messages });
      if (admission.kind === "reject") this.rejectRequest(connection, admission.id);
      return admission.kind === "forward" ? handle(connection, admission.frame) : undefined;
    };
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

  public async onStart(): Promise<void> {
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS leads (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT,
         contact TEXT NOT NULL,
         summary TEXT NOT NULL,
         created_at INTEGER NOT NULL
       );
       -- Rooms made before the per-visitor bucket still hold this table, and nothing else drops it.
       DROP TABLE IF EXISTS user_messages;`
    );
    const lastSeen = this.lastSeen();
    if (lastSeen === undefined) return;
    if (expiryTime(lastSeen) > Date.now()) {
      await this.scheduleExpiry({ idempotent: true });
      return;
    }
    // Every job the room holds is an expiry, so a pending one is due and the alarm that woke the
    // room runs it next.
    if ((await this.listSchedules()).length > 0) return;
    await this.deleteConversation(lastSeen);
    // destroy() aborts the room only on the next tick, so the request that woke it mustn't go on
    // to read the wiped storage.
    throw new Error("conversation expired");
  }

  public async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    const visitor = parseVisitorContext(ctx.request.headers);
    const key = parseVisitor(visitor?.ip);
    connection.setState({ visitor: key ?? UNKNOWN_VISITOR });
    if (!visitor) return;
    this.recordVisitor({ visitor, key });
    await this.scheduleExpiry({ idempotent: true });
  }

  // Public because schedule() only takes public method names. A sighting while an expiry is
  // pending moves only last-seen, so the expiry checks it and sets a fresh one when not yet due.
  public async expireConversation(): Promise<void> {
    const lastSeen = this.lastSeen();
    if (lastSeen === undefined) return;
    if (expiryTime(lastSeen) > Date.now()) {
      await this.scheduleExpiry({ idempotent: false });
      return;
    }
    await this.deleteConversation(lastSeen);
  }

  // Jobs that earlier deploys stored call this name. Each is due within 30 days of this deploy.
  public async eraseVisitorIp(): Promise<void> {
    await this.scheduleExpiry({ idempotent: true });
  }

  private async deleteConversation(lastSeen: number): Promise<void> {
    const db = this.env.CHAT_DB;
    await db?.batch([
      db
        .prepare(
          `DELETE FROM messages WHERE room_id = ?1
           AND NOT EXISTS (SELECT 1 FROM rooms WHERE room_id = ?1 AND last_seen > ?2)`
        )
        .bind(this.name, lastSeen),
      db
        .prepare(`DELETE FROM rooms WHERE room_id = ?1 AND last_seen <= ?2`)
        .bind(this.name, lastSeen)
    ]);
    // A reconnect during the await keeps the conversation going, though D1 loses its copy if the
    // batch reached D1 before the reconnect's own write.
    if (this.lastSeen() !== lastSeen) {
      await this.scheduleExpiry({ idempotent: false });
      return;
    }
    await this.destroy();
  }

  // Idempotent except from inside expireConversation: its own job still counts as pending until
  // it returns, so an idempotent schedule there would match that job and be dropped with it.
  private async scheduleExpiry({ idempotent }: { idempotent: boolean }): Promise<void> {
    const lastSeen = this.lastSeen();
    if (lastSeen === undefined) return;
    await this.schedule(new Date(expiryTime(lastSeen)), "expireConversation", undefined, {
      idempotent
    });
  }

  private lastSeen(): number | undefined {
    return Timestamp.safeParse(this.ctx.storage.kv.get("visitor_last_seen")).data;
  }

  // An interrupted turn is dropped rather than retried, since a retry bills the model again.
  public async onChatRecovery(): Promise<{ continue: false }> {
    return { continue: false };
  }

  public async onChatMessage(
    _onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0],
    options?: OnChatMessageOptions
  ): Promise<Response> {
    try {
      const key = this.deepseekKey();
      if (!key) return noticeResponse(LIMIT_NOTICE);
      const admission = await globalLimiter(this.env).admitChatTurn({
        visitor: this.turnVisitor(),
        apiKey: key
      });
      if (!admission.allowed) {
        console.log({ event: "chat turn refused", reason: admission.reason });
        return noticeResponse(LIMIT_NOTICE);
      }
      this.mirrorLatestUserMessage();

      const { page } = RequestBody.parse(options?.body ?? {});
      return createUIMessageStreamResponse({
        stream: createUIMessageStream<JarvisMessage>({
          execute: ({ writer }) =>
            this.reply({ writer, key, page, abortSignal: options?.abortSignal })
        })
      });
    } catch (cause) {
      console.error("chat turn failed", cause);
      return noticeResponse(ERROR_NOTICE);
    }
  }

  protected onChatResponse({ message }: ChatResponseResult): void {
    const content = messageText(message);
    if (content) this.mirrorMessage("assistant", content);
  }

  private async reply({ writer, ...call }: TurnCall): Promise<void> {
    writer.write({ type: "start" });
    let wroteText = false;
    let failure: Notice | null = null;
    try {
      wroteText = await this.relayModel({ writer, ...call });
    } catch (cause) {
      failure = await this.failureNotice(cause);
    }
    const notice = failure ?? (wroteText ? null : ERROR_NOTICE);
    if (notice) writer.write({ type: "data-notice", data: notice });
    writer.write({ type: "finish" });
  }

  // Only prose and the running tool's name reach the client: tool inputs hold contact details,
  // and outputs hold whole pages.
  private async relayModel({ writer, key, page, abortSignal }: TurnCall): Promise<boolean> {
    // Root llms.txt (~900 tokens) lists every post with its summary and link; blog/llms-full.txt
    // costs ~20x the tokens and grows per post.
    const result = streamText({
      ...jarvisCall({
        model: this.languageModel(key),
        messages: buildMessages(LLMS_TXT, this.history(), page),
        tools: jarvisTools({
          fetchPage: url => fetchSitePage(this.env.ASSETS, url),
          captureLead: lead => this.captureLead(lead)
        })
      }),
      abortSignal
    });
    let wroteText = false;
    for await (const part of result.stream) {
      if (part.type === "error") throw part.error;
      if (part.type === "finish-step") logUsage(part.usage);
      const chunk = streamChunk(part);
      if (!chunk) continue;
      wroteText ||= chunk.type === "text-delta" && chunk.delta.trim() !== "";
      writer.write(chunk);
    }
    return wroteText;
  }

  private async failureNotice(cause: unknown): Promise<Notice> {
    console.error("chat generation failed", cause);
    if (!isInsufficientBalance(cause)) return ERROR_NOTICE;
    await globalLimiter(this.env).markChatExhausted();
    return LIMIT_NOTICE;
  }

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
    const kv = this.ctx.storage.kv;
    if (kv.get("lead_captured") !== undefined) return;
    const mailer = contactMailer(this.env);
    if (!mailer) {
      console.error("opportunity email skipped: no EMAIL binding or inbox");
      return;
    }
    // Claimed before the send: two captures in one step run in parallel.
    kv.put("lead_captured", new Date().toISOString());
    try {
      await sendOpportunityEmail({
        ...mailer,
        lead,
        transcript: this.history()
      });
    } catch (cause) {
      // Lead is already in SQLite; losing the email must not kill the chat.
      console.error("opportunity email failed", cause);
      kv.delete("lead_captured");
    }
  }

  private turnVisitor(): VisitorKey {
    const state = getCurrentAgent().connection?.state;
    return ConnectionVisitor.safeParse(state).data?.visitor ?? UNKNOWN_VISITOR;
  }

  private recordVisitor({
    visitor,
    key
  }: {
    visitor: VisitorContext;
    key: VisitorKey | null;
  }): void {
    const kv = this.ctx.storage.kv;
    const now = Date.now();
    const knownFirstSeen = Timestamp.safeParse(kv.get("visitor_first_seen")).data;
    const firstSeen = knownFirstSeen ?? now;

    if (visitor.country !== null) kv.put("visitor_country", visitor.country);
    if (visitor.ip !== null) kv.put("visitor_ip", visitor.ip);
    if (key !== null) kv.put("visitor_key", key);
    kv.put("visitor_last_seen", now);
    if (knownFirstSeen === undefined) kv.put("visitor_first_seen", now);

    this.mirrorToD1(
      this.env.CHAT_DB?.prepare(
        `INSERT INTO rooms (room_id, country, ip, visitor_key, first_seen, last_seen)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (room_id) DO UPDATE SET
           country = COALESCE(excluded.country, rooms.country),
           ip = COALESCE(excluded.ip, rooms.ip),
           visitor_key = COALESCE(excluded.visitor_key, rooms.visitor_key),
           last_seen = excluded.last_seen`
      ).bind(this.name, visitor.country, visitor.ip, key, firstSeen, now)
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

  private mirrorLatestUserMessage(): void {
    const latest = this.messages.findLast(m => m.role === "user");
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
      statement.run().catch((cause: unknown) => console.error("d1 mirror failed", cause))
    );
  }
}

export function fetchActivity(url: string): Activity {
  try {
    return { name: "fetch_page", detail: new URL(url).pathname };
  } catch {
    return { name: "fetch_page" };
  }
}
