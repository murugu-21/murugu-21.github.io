import {Server, type Connection} from "partyserver";

import {runDeepseekExchange, runModelExchange} from "./ai";
import {parseLeadArguments, sendOpportunityEmail, type Lead} from "./email";
import {fetchSitePage} from "./fetch-page";
import {getGrounding} from "./grounding";
import {
  buildMessages,
  MODEL_ID,
  parseFetchArguments,
  ROOM_DAILY_LIMIT,
  type ModelMessage
} from "./prompt";
import {NEURON_DAILY_BUDGET, neuronCost} from "./rate-limiter";
import {type StreamResult, type Usage} from "./sse";
import {
  parseClientMessage,
  type ChatHistoryEntry,
  type ServerMessage
} from "./protocol";

const DAY_MS = 24 * 60 * 60 * 1000;

// Workers AI signals a spent free-tier allocation with AiError code 4006.
function isNeuronExhaustion(err: unknown): boolean {
  return (
    err instanceof Error &&
    /\b4006\b|free allocation of.*neurons/i.test(err.message)
  );
}

const LIMIT_MESSAGE =
  "I've hit my chat budget for now — please reach Murugappan directly " +
  "through the social links on this site instead.";

// "workers-ai" = free neuron allocation (primary); "deepseek" = paid BYOK
// overflow once the allocation is spent.
type Provider = "workers-ai" | "deepseek";

export class ChatRoom extends Server<Env> {
  static options = {hibernate: true};

  // Widen `ctx` from the base DurableObject's `protected` to `public` so
  // tests can drive `ctx.storage.sql` directly via `runInDurableObject`.
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

  onConnect(connection: Connection): void {
    this.send(connection, {type: "history", messages: this.history()});
  }

  async onMessage(connection: Connection, raw: unknown): Promise<void> {
    const msg = parseClientMessage(raw);
    if (!msg) {
      this.send(connection, {
        type: "error",
        message: "Sorry, I couldn't read that message."
      });
      return;
    }

    if (this.userMessagesSince(Date.now() - DAY_MS) >= ROOM_DAILY_LIMIT) {
      this.send(connection, {type: "limit", message: LIMIT_MESSAGE});
      return;
    }
    // Neuron budget: free Workers AI while the allocation lasts, then route
    // to DeepSeek (BYOK) if a key is configured; without one, gate politely.
    let provider: Provider = "workers-ai";
    if (!(await this.limiter().hasBudget())) {
      if (!this.deepseekKey()) {
        this.send(connection, {type: "limit", message: LIMIT_MESSAGE});
        return;
      }
      provider = "deepseek";
    }

    this.persist("user", msg.text);

    try {
      await this.generate(connection, provider);
    } catch (err) {
      console.error("chat generation failed", err);
      if (isNeuronExhaustion(err)) {
        // Workers AI says the account allocation is spent — our counter can
        // miss usage it never saw (e.g. burned before a deploy). Sync it so
        // hasBudget() routes straight to the fallback until 00:00 UTC, and
        // retry this message on DeepSeek right away. The 4006 comes from the
        // ai.run() call itself, so nothing has been streamed yet.
        await this.exhaustBudget();
        if (this.deepseekKey()) {
          try {
            await this.generate(connection, "deepseek");
            return;
          } catch (fallbackErr) {
            console.error("deepseek fallback failed", fallbackErr);
          }
        } else {
          this.send(connection, {type: "limit", message: LIMIT_MESSAGE});
          return;
        }
      }
      this.send(connection, {
        type: "error",
        message: "Something went wrong on my end — please try again."
      });
    }
  }

  // One full reply turn: grounded exchange with an on-demand fetch_page loop
  // (the model may pull a site page's full text before answering), optional
  // opportunity capture (a follow-up exchange on the same provider), persist.
  private async generate(
    connection: Connection,
    provider: Provider
  ): Promise<void> {
    const onDelta = (text: string) =>
      this.send(connection, {type: "delta", text});
    const grounding = await getGrounding(this.ctx.storage, this.env.ASSETS);
    const messages: ModelMessage[] = buildMessages(grounding, this.history());

    const MAX_FETCH_ROUNDS = 2;
    let reply = "";
    let capture: {id: string; name: string; arguments: string} | undefined;
    for (let round = 0; ; round++) {
      const result = await this.exchange(provider, messages, onDelta);
      reply += result.content;
      capture ??= result.toolCalls.find(t => t.name === "capture_opportunity");

      const fetchCall = result.toolCalls.find(t => t.name === "fetch_page");
      if (!fetchCall || round >= MAX_FETCH_ROUNDS) break;

      const url = parseFetchArguments(fetchCall.arguments);
      const page = url
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
              function: {name: fetchCall.name, arguments: fetchCall.arguments}
            }
          ]
        },
        {role: "tool", tool_call_id: fetchCall.id, content: page}
      );
    }

    if (capture) {
      if (reply) this.send(connection, {type: "delta", text: "\n"});
      const followUp = await this.handleCapture(capture, connection, provider);
      reply = [reply, followUp].filter(Boolean).join(reply ? "\n" : "");
    }

    // Qwen3's no-think mode can prefix replies with stray blank lines, and
    // fetch rounds can leave gaps where content spans exchanges.
    reply = reply.replace(/\n{3,}/g, "\n\n").trim();
    if (reply) this.persist("assistant", reply);
    this.send(connection, {type: "done"});
  }

  private async exchange(
    provider: Provider,
    messages: ModelMessage[],
    onDelta: (text: string) => void
  ): Promise<StreamResult> {
    if (provider === "deepseek") {
      const result = await runDeepseekExchange(
        this.deepseekKey()!,
        messages,
        onDelta
      );
      // Paid tokens — keep spend visible in `wrangler tail`.
      console.log("deepseek usage", JSON.stringify(result.usage));
      return result;
    }
    const result = await runModelExchange(this.env.AI, messages, onDelta);
    await this.chargeUsage(result.usage);
    return result;
  }

  private deepseekKey(): string | null {
    const key = (this.env as {DEEPSEEK_API_KEY?: string}).DEEPSEEK_API_KEY;
    const trimmed = key?.trim();
    return trimmed && !trimmed.startsWith("placeholder") ? trimmed : null;
  }

  private async exhaustBudget(): Promise<void> {
    try {
      const limiter = this.limiter();
      const spent = await limiter.spentToday();
      await limiter.charge(Math.max(NEURON_DAILY_BUDGET - spent, 1));
    } catch (err) {
      console.error("budget exhaustion sync failed", err);
    }
  }

  // Records the lead, emails once per conversation, and asks the model to
  // phrase the confirmation using the tool result.
  private async handleCapture(
    capture: {id: string; name: string; arguments: string},
    connection: Connection,
    provider: Provider
  ): Promise<string> {
    const lead = parseLeadArguments(capture.arguments);
    if (!lead) return "";

    this.storeLead(lead);

    const alreadyCaptured = this.ctx.storage.sql
      .exec(`SELECT value FROM meta WHERE key = 'lead_captured'`)
      .toArray();
    if (alreadyCaptured.length === 0) {
      try {
        await sendOpportunityEmail(
          this.env.EMAIL as unknown as Parameters<
            typeof sendOpportunityEmail
          >[0],
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

    // Second model pass so the visitor gets a natural confirmation. Strict
    // OpenAI shape (assistant.tool_calls → tool with tool_call_id) so any
    // chat-completions provider accepts the transcript.
    const grounding = await getGrounding(this.ctx.storage, this.env.ASSETS);
    const followUp = await this.exchange(
      provider,
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
      text => this.send(connection, {type: "delta", text})
    );
    return followUp.content;
  }

  private limiter() {
    return this.env.RateLimiter.get(this.env.RateLimiter.idFromName("global"));
  }

  private async chargeUsage(usage: Usage | null): Promise<void> {
    if (!usage) return;
    try {
      await this.limiter().charge(
        neuronCost(MODEL_ID, usage.promptTokens, usage.completionTokens)
      );
    } catch (err) {
      // Budget accounting must never take down a chat that already answered.
      console.error("neuron charge failed", err);
    }
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
      .exec(
        `SELECT COUNT(*) AS n FROM messages WHERE role = 'user' AND created_at > ?`,
        cutoff
      )
      .one();
    return row.n as number;
  }

  private persist(role: "user" | "assistant", content: string): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)`,
      role,
      content,
      Date.now()
    );
  }

  private send(connection: Connection, message: ServerMessage): void {
    connection.send(JSON.stringify(message));
  }
}
