import {Server, type Connection} from "partyserver";

import {runModelExchange} from "./ai";
import {parseLeadArguments, sendOpportunityEmail, type Lead} from "./email";
import {getGrounding} from "./grounding";
import {buildMessages, ROOM_DAILY_LIMIT} from "./prompt";
import {NEURON_DAILY_BUDGET, neuronCost} from "./rate-limiter";
import {type Usage} from "./sse";
import {
  parseClientMessage,
  type ChatHistoryEntry,
  type ServerMessage
} from "./protocol";

const DAY_MS = 24 * 60 * 60 * 1000;

// Workers AI signals a spent free-tier allocation with AiError code 4006.
function isNeuronExhaustion(err: unknown): boolean {
  return (
    err instanceof Error && /\b4006\b|free allocation of.*neurons/i.test(err.message)
  );
}

const LIMIT_MESSAGE =
  "I've hit my chat budget for now — please reach Murugappan directly " +
  "through the social links on this site instead.";

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
    // Neuron budget: cheap pre-check here, actual usage charged after each
    // model exchange — the daily cap tracks what Workers AI really serves.
    if (!(await this.limiter().hasBudget())) {
      this.send(connection, {type: "limit", message: LIMIT_MESSAGE});
      return;
    }

    this.persist("user", msg.text);

    try {
      const grounding = await getGrounding(this.ctx.storage, this.env.ASSETS);
      const result = await runModelExchange(
        this.env.AI,
        buildMessages(grounding, this.history()),
        text => this.send(connection, {type: "delta", text})
      );
      await this.chargeUsage(result.usage);

      let reply = result.content;
      const capture = result.toolCalls.find(
        t => t.name === "capture_opportunity"
      );
      if (capture) {
        if (reply) this.send(connection, {type: "delta", text: "\n"});
        const followUp = await this.handleCapture(
          capture.arguments,
          connection
        );
        reply = [reply, followUp].filter(Boolean).join(reply ? "\n" : "");
      }

      if (reply) this.persist("assistant", reply);
      this.send(connection, {type: "done"});
    } catch (err) {
      console.error("chat generation failed", err);
      if (isNeuronExhaustion(err)) {
        // Workers AI says the account allocation is spent — our counter can
        // miss usage it never saw (e.g. burned before a deploy). Sync it so
        // hasBudget() gates cleanly until the 00:00 UTC reset.
        await this.exhaustBudget();
        this.send(connection, {type: "limit", message: LIMIT_MESSAGE});
        return;
      }
      this.send(connection, {
        type: "error",
        message: "Something went wrong on my end — please try again."
      });
    }
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
    rawArgs: string,
    connection: Connection
  ): Promise<string> {
    const lead = parseLeadArguments(rawArgs);
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

    // Second model pass so the visitor gets a natural confirmation.
    const grounding = await getGrounding(this.ctx.storage, this.env.ASSETS);
    const followUp = await runModelExchange(
      this.env.AI,
      [
        ...buildMessages(grounding, this.history()),
        {
          role: "assistant",
          content: JSON.stringify({
            tool_call: "capture_opportunity",
            arguments: lead
          })
        },
        {
          role: "tool",
          content: JSON.stringify({
            status: "recorded",
            note: "Murugappan will be notified by email."
          })
        }
      ],
      text => this.send(connection, {type: "delta", text})
    );
    await this.chargeUsage(followUp.usage);
    return followUp.content;
  }

  private limiter() {
    return this.env.RateLimiter.get(this.env.RateLimiter.idFromName("global"));
  }

  private async chargeUsage(usage: Usage | null): Promise<void> {
    if (!usage) return;
    try {
      await this.limiter().charge(
        neuronCost(usage.promptTokens, usage.completionTokens)
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
