import {DurableObject} from "cloudflare:workers";

export const GLOBAL_DAILY_LIMIT = 300;

// Single fixed-name instance ("global") shared by every ChatRoom: one source
// of truth for the site-wide daily message budget.
export class RateLimiter extends DurableObject {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS counters (
        day TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0
      )`
    );
  }

  consume(): boolean {
    const day = new Date().toISOString().slice(0, 10);
    this.sql.exec(
      `INSERT INTO counters (day, count) VALUES (?, 0)
       ON CONFLICT (day) DO NOTHING`,
      day
    );
    const row = this.sql
      .exec(`SELECT count FROM counters WHERE day = ?`, day)
      .one();
    if ((row.count as number) >= GLOBAL_DAILY_LIMIT) return false;
    this.sql.exec(`UPDATE counters SET count = count + 1 WHERE day = ?`, day);
    return true;
  }
}
