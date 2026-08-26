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
  GREETING,
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

// "deepseek" = paid BYOK, the primary path: fast, and it streams a reply to
// completion. "workers-ai" = the free neuron allocation, kept as the fallback
// for when no DeepSeek key is configured or the DeepSeek call fails — it is
// markedly slower and the free tier can cut a reply off mid-stream.
type Provider = "deepseek" | "workers-ai";

// Providers to try, in order, for one turn. DeepSeek leads when a key is
// configured and Workers AI is the free backstop behind it; with no key the
// free tier is all there is.
export function providerChain(hasDeepseekKey: boolean): Provider[] {
  return hasDeepseekKey ? ["deepseek", "workers-ai"] : ["workers-ai"];
}

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
    // Seed the greeting as the room's first persisted message so history
    // replays and transcript downloads always include the opener. The check
    // and insert are synchronous — no interleaving, no double seed.
    const count = this.ctx.storage.sql
      .exec(`SELECT COUNT(*) AS n FROM messages`)
      .one().n as number;
    if (count === 0) this.persist("assistant", GREETING);
    this.send(connection, {type: "history", messages: this.history()});
  }

  // Serializes turns: two tabs of the same room can send concurrently, and
  // although the DO is single-threaded, two onMessage invocations would
  // interleave across await points — garbling the broadcast streams. Each
  // turn waits for the previous one to finish.
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
    msg: {text: string; page?: string}
  ): Promise<void> {
    if (this.userMessagesSince(Date.now() - DAY_MS) >= ROOM_DAILY_LIMIT) {
      this.send(connection, {type: "limit", message: LIMIT_MESSAGE});
      return;
    }
    // DeepSeek first whenever a key is configured; Workers AI only backs it
    // up. The neuron budget is therefore checked lazily — the primary path
    // costs no RateLimiter round-trip.
    const key = this.deepseekKey();
    if (!key && !(await this.limiter().hasBudget())) {
      this.send(connection, {type: "limit", message: LIMIT_MESSAGE});
      return;
    }

    this.persist("user", msg.text);
    // Keep other open tabs of this room in sync — the sender already
    // rendered its own bubble optimistically, so it is excluded.
    this.broadcastMsg({type: "visitor", text: msg.text}, [connection.id]);

    for (const provider of providerChain(Boolean(key))) {
      // Workers AI is only ever tried with allocation left: a 4006 mid-turn
      // would waste the visitor's wait for nothing.
      if (provider === "workers-ai" && !(await this.limiter().hasBudget())) {
        continue;
      }
      let streamed = false;
      try {
        await this.generate(connection, provider, msg.page, () => {
          streamed = true;
        });
        return;
      } catch (err) {
        console.error(`chat generation failed (${provider})`, err);
        // Workers AI says the account allocation is spent — our counter can
        // miss usage it never saw (e.g. burned before a deploy). Sync it so
        // hasBudget() stops routing here until 00:00 UTC.
        if (isNeuronExhaustion(err)) await this.exhaustBudget();
        // Once deltas have reached the visitor a retry would duplicate the
        // reply, so a mid-stream failure ends the turn.
        if (streamed) break;
      }
    }

    // Every available provider failed. Only the no-capacity case gets the
    // polite gate; anything else is a genuine fault.
    const outOfCapacity = !key && !(await this.limiter().hasBudget());
    this.send(
      connection,
      outOfCapacity
        ? {type: "limit", message: LIMIT_MESSAGE}
        : {
            type: "error",
            message: "Something went wrong on my end — please try again."
          }
    );
  }

  // One full reply turn: grounded exchange with an on-demand fetch_page loop
  // (the model may pull a site page's full text before answering), optional
  // opportunity capture (a follow-up exchange on the same provider), persist.
  private async generate(
    connection: Connection,
    provider: Provider,
    page?: string,
    onStreamed: () => void = () => {}
  ): Promise<void> {
    // Replies stream to every open tab of the room, not just the sender.
    // `onStreamed` tells the caller a retry on another provider would now
    // duplicate text the visitor has already seen.
    const onDelta = (text: string) => {
      if (text) onStreamed();
      this.broadcastMsg({type: "delta", text});
    };
    const grounding = await getGrounding(this.ctx.storage, this.env.ASSETS);
    const messages: ModelMessage[] = buildMessages(
      grounding,
      this.history(),
      page
    );

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
              function: {name: fetchCall.name, arguments: fetchCall.arguments}
            }
          ]
        },
        {role: "tool", tool_call_id: fetchCall.id, content: pageText}
      );
    }

    if (capture) {
      if (reply) this.broadcastMsg({type: "delta", text: "\n"});
      const followUp = await this.handleCapture(capture, provider, onDelta);
      reply = [reply, followUp].filter(Boolean).join(reply ? "\n" : "");
    }

    // Qwen3's no-think mode can prefix replies with stray blank lines, and
    // fetch rounds can leave gaps where content spans exchanges.
    reply = reply.replace(/\n{3,}/g, "\n\n").trim();
    if (reply) this.persist("assistant", reply);
    this.broadcastMsg({type: "done"});
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
    provider: Provider,
    onDelta: (text: string) => void
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
      onDelta
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
    const createdAt = Date.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)`,
      role,
      content,
      createdAt
    );
    // Fire-and-forget mirror to D1 so every room's chat is browsable in the
    // Cloudflare dash (rooms aren't enumerable, so this is the only global
    // view). The DO's own SQLite stays the serving source of truth; a mirror
    // failure logs and never touches the conversation.
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
