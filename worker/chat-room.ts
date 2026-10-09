import { AIChatAgent, type ChatResponseResult } from "@cloudflare/ai-chat";
import type { Connection, ConnectionContext } from "agents";
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

import { deepseek, isInsufficientBalance, jarvisCall } from "./ai";
import { globalLimiter } from "./api/ratelimit";
import { admitFrame } from "./chat-frames";
import { LLMS_TXT } from "./content";
import { contactMailer, sendOpportunityEmail } from "./email";
import { fetchSitePage } from "./fetch-page";
import { lenient } from "@murugappan/utils/json.ts";
import { messageText } from "@murugappan/utils/ui-message.ts";
import { buildMessages, jarvisTools, ROOM_DAILY_LIMIT, type Lead } from "./prompt";
import {
  ERROR_NOTICE,
  LIMIT_NOTICE,
  type Activity,
  type ChatHistoryEntry,
  type JarvisMessage,
  type Notice
} from "@murugappan/contracts/chat.ts";
import { parseVisitorContext } from "./visitor";

const DAY_MS = 24 * 60 * 60 * 1000;

type CountRow = { n: number };

const UNREADABLE = "Sorry, I couldn't read that message.";

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

type TurnCall = {
  writer: UIMessageStreamWriter<JarvisMessage>;
  key: string;
  page?: string;
  abortSignal?: AbortSignal;
};

// A tool call is sent as it is parsed, before the tool runs: a page fetch is a turn's longest
// silence.
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
  maxPersistedMessages = 200;
  // A message sent while a turn runs (another tab, say) is refused, so turns never interleave.
  messageConcurrency = "drop" as const;

  // Public so tests can drive `ctx.storage.sql` via `runInDurableObject`.
  declare public ctx: DurableObjectState<Record<string, unknown>>;

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

  onStart(): void {
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS user_messages (created_at INTEGER NOT NULL);
       CREATE TABLE IF NOT EXISTS leads (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT,
         contact TEXT NOT NULL,
         summary TEXT NOT NULL,
         created_at INTEGER NOT NULL
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

  // One reply: the model's stream, then the notice (if any) that closes the turn.
  private async reply({ writer, ...call }: TurnCall): Promise<void> {
    writer.write({ type: "start" });
    let wroteText = false;
    let failure: Notice | null = null;
    try {
      wroteText = await this.relayModel({ writer, ...call });
    } catch (err) {
      failure = await this.failureNotice(err);
    }
    // Every turn ends in prose or a notice; the widget waits for one or the other.
    // A cancelled turn still ends quietly: the SDK drops what is written after a cancel.
    const notice = failure ?? (wroteText ? null : ERROR_NOTICE);
    if (notice) writer.write({ type: "data-notice", data: notice });
    writer.write({ type: "finish" });
  }

  // The AI SDK tool loop. Only prose and the running tool's name reach the client: tool
  // inputs hold contact details, and outputs hold whole pages. Resolves to whether any
  // prose was written.
  private async relayModel({ writer, key, page, abortSignal }: TurnCall): Promise<boolean> {
    // Root llms.txt (~900 tokens) lists every post with its title, summary and link.
    // blog/llms-full.txt costs ~20x the tokens and grows per post.
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

  private async failureNotice(err: unknown): Promise<Notice> {
    console.error("chat generation failed", err);
    // A 402 beats the cached balance, so gate every room until the next check.
    if (!isInsufficientBalance(err)) return ERROR_NOTICE;
    await globalLimiter(this.env).markChatExhausted();
    return LIMIT_NOTICE;
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
    } catch (err) {
      // Lead is already in SQLite; losing the email must not kill the chat.
      console.error("opportunity email failed", err);
      kv.delete("lead_captured");
    }
  }

  // Stored under `visitor_*` storage keys and mirrored to one D1 `rooms` row.
  // A missing value never erases a known one.
  private recordVisitor(request: Request): void {
    const visitor = parseVisitorContext(request.headers);
    if (!visitor) return;

    const kv = this.ctx.storage.kv;
    const now = Date.now();
    const knownFirstSeen = kv.get("visitor_first_seen");
    const firstSeen = typeof knownFirstSeen === "number" ? knownFirstSeen : now;

    if (visitor.country !== null) kv.put("visitor_country", visitor.country);
    if (visitor.ip !== null) kv.put("visitor_ip", visitor.ip);
    kv.put("visitor_last_seen", now);
    if (typeof knownFirstSeen !== "number") kv.put("visitor_first_seen", now);

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
