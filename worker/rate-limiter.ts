import {DurableObject} from "cloudflare:workers";

// Workers AI's free allocation is 10,000 neurons/day (developers.cloudflare
// .com/workers-ai/platform/pricing, checked 2026-08-13). The daily budget sits
// slightly under it because the budget check and the usage charge straddle the
// model call — the last exchange of the day can overshoot by one call's cost.
export const NEURON_DAILY_BUDGET = 9500;

// @cf/openai/gpt-oss-120b conversion rates from the same pricing page.
export const NEURONS_PER_M_INPUT_TOKENS = 31818;
export const NEURONS_PER_M_OUTPUT_TOKENS = 68182;

export function neuronCost(
  promptTokens: number,
  completionTokens: number
): number {
  return (
    (promptTokens * NEURONS_PER_M_INPUT_TOKENS +
      completionTokens * NEURONS_PER_M_OUTPUT_TOKENS) /
    1_000_000
  );
}

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
