import {DurableObject} from "cloudflare:workers";

// The allowance itself lives with the endpoint that spends it — api/contact.ts
// has no Workers-runtime imports, so the OpenAPI document and the /developers
// page can quote the same numbers without pulling this Durable Object (and
// `cloudflare:workers` with it) into the Astro bundle.
import {CONTACT_DAILY_GLOBAL, CONTACT_DAILY_PER_CLIENT} from "./api/contact";

// Workers AI's free allocation is 10,000 neurons/day (developers.cloudflare
// .com/workers-ai/platform/pricing, checked 2026-08-13). The daily budget sits
// slightly under it because the budget check and the usage charge straddle the
// model call — the last exchange of the day can overshoot by one call's cost.
export const NEURON_DAILY_BUDGET = 9500;

// Per-model conversion rates (neurons per M tokens) from the same pricing
// page. Keyed by model id so swapping MODEL_ID in prompt.ts keeps the budget
// math honest — an unknown id falls back to the most expensive known rates,
// which under-counts capacity rather than blowing the real allocation.
export const MODEL_NEURON_RATES: Record<
  string,
  {inputPerM: number; outputPerM: number}
> = {
  "@cf/qwen/qwen3-30b-a3b-fp8": {inputPerM: 4625, outputPerM: 30475},
  "@cf/openai/gpt-oss-120b": {inputPerM: 31818, outputPerM: 68182}
};

const FALLBACK_RATES = Object.values(MODEL_NEURON_RATES).reduce((a, b) =>
  a.inputPerM >= b.inputPerM ? a : b
);

export function neuronCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): number {
  const rates = MODEL_NEURON_RATES[modelId] ?? FALLBACK_RATES;
  return (
    (promptTokens * rates.inputPerM + completionTokens * rates.outputPerM) /
    1_000_000
  );
}

export type ContactSlot =
  | {allowed: true}
  | {allowed: false; scope: "client" | "global"};

// Single fixed-name instance ("global") shared by every ChatRoom: one source
// of truth for the site-wide daily Workers AI budget, denominated in neurons
// so the cap always equals what the free tier actually serves.
export class RateLimiter extends DurableObject {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.sql = ctx.storage.sql;
    // Replaces the old message-count `counters` table; that one is left in
    // place (harmless) so existing production instances need no migration.
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS neuron_counters (
        day TEXT PRIMARY KEY,
        neurons REAL NOT NULL DEFAULT 0
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
  // the DO. hasBudget → model call → charge is NOT one atomic unit; the
  // budget's headroom under the real 10k allocation absorbs that overshoot.
  hasBudget(): boolean {
    return this.spentToday() < NEURON_DAILY_BUDGET;
  }

  charge(neurons: number): void {
    if (!Number.isFinite(neurons) || neurons <= 0) return;
    this.sql.exec(
      `INSERT INTO neuron_counters (day, neurons) VALUES (?, ?)
       ON CONFLICT (day) DO UPDATE SET neurons = neurons + excluded.neurons`,
      this.today(),
      neurons
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
    if (this.contactCount(clientKey) >= CONTACT_DAILY_PER_CLIENT)
      return {allowed: false, scope: "client"};
    const globalKey = `${day}:global`;
    if (this.contactCount(globalKey) >= CONTACT_DAILY_GLOBAL)
      return {allowed: false, scope: "global"};
    this.bumpContact(clientKey);
    this.bumpContact(globalKey);
    return {allowed: true};
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

  spentToday(): number {
    const rows = this.sql
      .exec(`SELECT neurons FROM neuron_counters WHERE day = ?`, this.today())
      .toArray();
    return rows.length ? (rows[0].neurons as number) : 0;
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
