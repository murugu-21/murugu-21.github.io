import {DurableObject} from "cloudflare:workers";

import {fetchDeepseekBalance} from "./ai";
// The allowance itself lives with the endpoint that spends it — api/contact.ts
// has no Workers-runtime imports, so the OpenAPI document and the /developers
// page can quote the same numbers without pulling this Durable Object (and
// `cloudflare:workers` with it) into the Astro bundle.
import {CONTACT_DAILY_GLOBAL, CONTACT_DAILY_PER_CLIENT} from "./api/contact";

// Chat is gated on the DeepSeek account's real balance rather than a daily
// allowance: the budget is whatever has actually been paid for, and a top-up
// widens the tap on its own. Stop a little above zero so the last exchange of
// the day can't land mid-reply on an empty account.
export const BALANCE_RESERVE_USD = 0.05;

// How long a balance reading is trusted. DeepSeek's balance settles behind
// real usage, so a shorter TTL buys little accuracy and costs a round-trip in
// front of a visitor's message; the 402 path is the accurate one.
export const BALANCE_TTL_MS = 10 * 60 * 1000;

const BALANCE_KEY = "deepseek:balance";

type CachedBalance = {available: boolean; totalUsd: number; checkedAt: number};

/** What is left of each contact tier for today, after the call that reported it. */
export type ContactUsage = {clientRemaining: number; globalRemaining: number};

export type ContactSlot = ContactUsage &
  ({allowed: true} | {allowed: false; scope: "client" | "global"});

// Single fixed-name instance ("global") shared by every ChatRoom: one place
// to cache the DeepSeek balance, so N conversations cost one balance check
// rather than N, and one room hitting a 402 gates the whole site at once.
export class RateLimiter extends DurableObject {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.sql = ctx.storage.sql;
    // Chat once kept a daily counter here (message counts, then Workers AI
    // neurons, then DeepSeek dollars). All three are gone: the balance is
    // read from DeepSeek instead of reconstructed locally. Their tables are
    // left in place rather than dropped — the only destructive step in an
    // otherwise additive schema, for rows that are already worthless.
    // Keyed "<day>:global" / "<day>:client:<ip>" so both tiers share one
    // table and yesterday's rows are trivially identifiable for cleanup.
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS contact_counters (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0
      )`
    );
  }

  // Can chat still be served? Cached for BALANCE_TTL_MS, so a busy minute
  // costs one call to DeepSeek rather than one per message. A failed lookup
  // fails OPEN: the balance endpoint being unreachable is no reason to take
  // the widget down, and a genuinely empty account is caught by the 402 on
  // the very next exchange.
  async chatAvailable(
    apiKey: string,
    // Injected by tests only; an RPC caller passes just the key.
    fetcher: typeof fetch = fetch
  ): Promise<boolean> {
    const cached = await this.ctx.storage.get<CachedBalance>(BALANCE_KEY);
    if (cached && Date.now() - cached.checkedAt < BALANCE_TTL_MS) {
      return cached.available && cached.totalUsd > BALANCE_RESERVE_USD;
    }
    try {
      const {available, totalUsd} = await fetchDeepseekBalance(apiKey, fetcher);
      await this.ctx.storage.put(BALANCE_KEY, {
        available,
        totalUsd,
        checkedAt: Date.now()
      } satisfies CachedBalance);
      return available && totalUsd > BALANCE_RESERVE_USD;
    } catch (err) {
      console.error("deepseek balance check failed", err);
      return true;
    }
  }

  // Called when DeepSeek itself reports an empty account. Parks the cache in
  // the exhausted state so every room gates immediately, and lets it expire
  // normally — a top-up is picked up at the next TTL boundary with no deploy.
  async markChatExhausted(): Promise<void> {
    await this.ctx.storage.put(BALANCE_KEY, {
      available: false,
      totalUsd: 0,
      checkedAt: Date.now()
    } satisfies CachedBalance);
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

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
