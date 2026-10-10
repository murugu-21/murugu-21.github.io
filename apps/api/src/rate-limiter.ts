import { DurableObject } from "cloudflare:workers";
import { z } from "zod";

import { fetchDeepseekBalance, type DeepseekBalance } from "./ai";
// Limits live in api/contact.ts so the Astro bundle can quote them without
// importing `cloudflare:workers`.
import {
  CONTACT_DAILY_GLOBAL,
  CONTACT_DAILY_PER_CLIENT
} from "@murugappan/contracts/api/contact.ts";

// The reserve keeps the last exchange from running out mid-reply.
export const BALANCE_RESERVE_USD = 0.05;

// DeepSeek's balance lags real usage, so a shorter TTL buys little; the 402
// path is the accurate one.
const BALANCE_TTL_MS = 10 * 60 * 1000;

const BALANCE_KEY = "deepseek:balance";

const CachedBalance = z.object({
  available: z.boolean(),
  totalUsd: z.number(),
  checkedAt: z.number()
}) satisfies z.ZodType<DeepseekBalance>;
type CachedBalance = z.infer<typeof CachedBalance>;

const hasFunds = ({ available, totalUsd }: DeepseekBalance): boolean =>
  available && totalUsd > BALANCE_RESERVE_USD;

/** What is left of each contact tier today, after the reporting call. */
type ContactUsage = { clientRemaining: number; globalRemaining: number };

type ContactSlot = ContactUsage &
  ({ allowed: true } | { allowed: false; scope: "client" | "global" });

// One fixed-name instance ("global") shared by every ChatRoom, so the balance
// is checked once and one room's 402 gates the whole site.
export class RateLimiter extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // Keyed "<day>:global" / "<day>:client:<ip>" so stale days are easy to purge.
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS contact_counters (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0
      )`
    );
  }

  private async cachedBalance(): Promise<CachedBalance | undefined> {
    return CachedBalance.safeParse(await this.ctx.storage.get(BALANCE_KEY)).data;
  }

  // Fails OPEN on a lookup error, since the next 402 catches an empty account.
  async chatAvailable(
    apiKey: string,
    // Injected by tests only; an RPC caller passes just the key.
    fetcher: typeof fetch = fetch
  ): Promise<boolean> {
    const cached = await this.cachedBalance();
    if (cached && Date.now() - cached.checkedAt < BALANCE_TTL_MS) return hasFunds(cached);
    try {
      const balance = await fetchDeepseekBalance(apiKey, fetcher);
      // The object takes other calls during the fetch, so anything written meanwhile
      // (a 402, another check) is newer than this reading.
      const latest = await this.cachedBalance();
      if (latest && latest.checkedAt !== cached?.checkedAt) return hasFunds(latest);
      await this.ctx.storage.put(BALANCE_KEY, {
        ...balance,
        checkedAt: Date.now()
      } satisfies CachedBalance);
      return hasFunds(balance);
    } catch (err) {
      console.error("deepseek balance check failed", err);
      return true;
    }
  }

  // Parks the cache as exhausted; it expires normally, so a top-up is picked
  // up at the next TTL boundary.
  async markChatExhausted(): Promise<void> {
    await this.ctx.storage.put(BALANCE_KEY, {
      available: false,
      totalUsd: 0,
      checkedAt: Date.now()
    } satisfies CachedBalance);
  }

  // Synchronous so read-check-increment is atomic in the DO.
  takeContactSlot(client: string): ContactSlot {
    const day = this.today();
    this.sql.exec(`DELETE FROM contact_counters WHERE key NOT LIKE ?`, `${day}:%`);
    const clientKey = `${day}:client:${client}`;
    const globalKey = `${day}:global`;
    const clientUsed = this.contactCount(clientKey);
    if (clientUsed >= CONTACT_DAILY_PER_CLIENT)
      return {
        allowed: false,
        scope: "client",
        ...this.remaining({ clientUsed, globalUsed: this.contactCount(globalKey) })
      };
    const globalUsed = this.contactCount(globalKey);
    if (globalUsed >= CONTACT_DAILY_GLOBAL)
      return {
        allowed: false,
        scope: "global",
        ...this.remaining({ clientUsed, globalUsed })
      };
    this.bumpContact(clientKey);
    this.bumpContact(globalKey);
    return {
      allowed: true,
      ...this.remaining({ clientUsed: clientUsed + 1, globalUsed: globalUsed + 1 })
    };
  }

  /** Remaining allowance without spending any, for a dry run. */
  contactUsage(client: string): ContactUsage {
    const day = this.today();
    return this.remaining({
      clientUsed: this.contactCount(`${day}:client:${client}`),
      globalUsed: this.contactCount(`${day}:global`)
    });
  }

  private remaining({
    clientUsed,
    globalUsed
  }: {
    clientUsed: number;
    globalUsed: number;
  }): ContactUsage {
    return {
      clientRemaining: Math.max(0, CONTACT_DAILY_PER_CLIENT - clientUsed),
      globalRemaining: Math.max(0, CONTACT_DAILY_GLOBAL - globalUsed)
    };
  }

  private contactCount(key: string): number {
    const rows = this.sql
      .exec<{ count: number }>(`SELECT count FROM contact_counters WHERE key = ?`, key)
      .toArray();
    return rows.length ? rows[0].count : 0;
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
