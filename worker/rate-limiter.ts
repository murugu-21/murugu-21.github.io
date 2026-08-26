import {DurableObject} from "cloudflare:workers";

// The allowance itself lives with the endpoint that spends it — api/contact.ts
// has no Workers-runtime imports, so the OpenAPI document and the /developers
// page can quote the same numbers without pulling this Durable Object (and
// `cloudflare:workers` with it) into the Astro bundle.
import {CONTACT_DAILY_GLOBAL, CONTACT_DAILY_PER_CLIENT} from "./api/contact";

// Site-wide ceiling on chat spend, in USD per UTC day. ROOM_DAILY_LIMIT caps
// one conversation; this caps the whole site, so N visitors opening N rooms
// cannot run up an unbounded DeepSeek bill.
//
// Measured 2026-08-27 against the live API: ~$0.0018 per grounded exchange
// (~3.6k prompt tokens once the system prompt, llms.txt grounding and history
// are counted, ~150 out) and ~$0.003 per conversational TURN, since a turn
// runs up to three exchanges — two fetch_page rounds plus the capture
// follow-up. So this budget is roughly 170 turns a day.
export const CHAT_DAILY_BUDGET_USD = 0.5;

// deepseek-v4-flash list prices, USD per M tokens (api-docs.deepseek.com
// /quick_start/pricing, checked 2026-08-27). These are the PEAK numbers, and
// input is priced as a cache miss, so the budget always over-counts what a
// call really cost — it under-serves capacity rather than overshooting the
// real bill. Off-peak is half this and a grounding cache hit is ~30x cheaper.
export const DEEPSEEK_RATES = {inputPerM: 0.44, outputPerM: 1.32};

export function exchangeCost(
  promptTokens: number,
  completionTokens: number
): number {
  return (
    (promptTokens * DEEPSEEK_RATES.inputPerM +
      completionTokens * DEEPSEEK_RATES.outputPerM) /
    1_000_000
  );
}

/** What is left of each contact tier for today, after the call that reported it. */
export type ContactUsage = {clientRemaining: number; globalRemaining: number};

export type ContactSlot = ContactUsage &
  ({allowed: true} | {allowed: false; scope: "client" | "global"});

// Single fixed-name instance ("global") shared by every ChatRoom: one source
// of truth for the site-wide daily chat budget, denominated in the dollars
// DeepSeek actually bills.
export class RateLimiter extends DurableObject {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.sql = ctx.storage.sql;
    // Third generation of this counter (message counts, then Workers AI
    // neurons, now DeepSeek dollars). Each got a new table rather than a
    // migration: the rows are per-day totals that age out on their own, and a
    // fresh name means old rows in retired units can never be read as new
    // ones. The dead tables are left in place — dropping them would be the
    // only destructive step in an otherwise additive schema.
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS chat_spend (
        day TEXT PRIMARY KEY,
        usd REAL NOT NULL DEFAULT 0
      )`
    );
    // Keyed "<day>:global" / "<day>:client:<ip>" so both tiers share one
    // table and yesterday's rows are trivially identifiable for cleanup.
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS contact_counters (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0
      )`
    );
  }

  // Both methods are synchronous (no awaits), so each runs atomically inside
  // the DO. hasBudget → model call → charge is NOT one atomic unit, so the
  // last exchange of the day can overshoot by one call's cost — cents, and
  // the conservative peak-rate pricing above already pads for it.
  hasBudget(): boolean {
    return this.spentToday() < CHAT_DAILY_BUDGET_USD;
  }

  charge(usd: number): void {
    if (!Number.isFinite(usd) || usd <= 0) return;
    this.sql.exec(
      `INSERT INTO chat_spend (day, usd) VALUES (?, ?)
       ON CONFLICT (day) DO UPDATE SET usd = usd + excluded.usd`,
      this.today(),
      usd
    );
  }

  // Synchronous, so the read-check-increment runs atomically inside the DO:
  // two concurrent agents can never both take the last slot. The client tier
  // is checked first, and a client-blocked request never touches the global
  // counter — one noisy caller must not spend the site-wide allowance.
  takeContactSlot(client: string): ContactSlot {
    const day = this.today();
    this.sql.exec(
      `DELETE FROM contact_counters WHERE key NOT LIKE ?`,
      `${day}:%`
    );
    const clientKey = `${day}:client:${client}`;
    const globalKey = `${day}:global`;
    const clientUsed = this.contactCount(clientKey);
    if (clientUsed >= CONTACT_DAILY_PER_CLIENT)
      return {
        allowed: false,
        scope: "client",
        ...this.remaining(clientUsed, this.contactCount(globalKey))
      };
    const globalUsed = this.contactCount(globalKey);
    if (globalUsed >= CONTACT_DAILY_GLOBAL)
      return {
        allowed: false,
        scope: "global",
        ...this.remaining(clientUsed, globalUsed)
      };
    this.bumpContact(clientKey);
    this.bumpContact(globalKey);
    return {allowed: true, ...this.remaining(clientUsed + 1, globalUsed + 1)};
  }

  /**
   * What is left of both tiers without spending anything — for a dry run,
   * which has to report the allowance honestly precisely because it does not
   * consume it.
   */
  contactUsage(client: string): ContactUsage {
    const day = this.today();
    return this.remaining(
      this.contactCount(`${day}:client:${client}`),
      this.contactCount(`${day}:global`)
    );
  }

  private remaining(clientUsed: number, globalUsed: number): ContactUsage {
    return {
      clientRemaining: Math.max(0, CONTACT_DAILY_PER_CLIENT - clientUsed),
      globalRemaining: Math.max(0, CONTACT_DAILY_GLOBAL - globalUsed)
    };
  }

  contactsSentToday(): number {
    return this.contactCount(`${this.today()}:global`);
  }

  private contactCount(key: string): number {
    const rows = this.sql
      .exec(`SELECT count FROM contact_counters WHERE key = ?`, key)
      .toArray();
    return rows.length ? (rows[0].count as number) : 0;
  }

  private bumpContact(key: string): void {
    this.sql.exec(
      `INSERT INTO contact_counters (key, count) VALUES (?, 1)
       ON CONFLICT (key) DO UPDATE SET count = count + 1`,
      key
    );
  }

  /** Dollars spent on chat so far today. */
  spentToday(): number {
    const rows = this.sql
      .exec(`SELECT usd FROM chat_spend WHERE day = ?`, this.today())
      .toArray();
    return rows.length ? (rows[0].usd as number) : 0;
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
