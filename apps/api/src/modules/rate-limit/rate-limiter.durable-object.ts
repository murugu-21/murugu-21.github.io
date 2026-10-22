import { DurableObject } from "cloudflare:workers";
import { z } from "zod";

import { fetchDeepseekBalance, type DeepseekBalance } from "#src/modules/chat/deepseek.client.ts";
import {
  CHAT_BUCKET,
  CHAT_DAILY_GLOBAL,
  takeToken,
  type ChatAdmission,
  type TokenBucket
} from "#src/modules/rate-limit/chat-quota.ts";
import type {
  ContactSlot,
  ContactUsage
} from "#src/modules/rate-limit/contact-quota.repository.ts";
import type { VisitorKey } from "#src/modules/rate-limit/visitor-key.ts";
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

export const BALANCE_KEY = "deepseek:balance";

const CachedBalance = z.object({
  available: z.boolean(),
  totalUsd: z.number(),
  checkedAt: z.number()
}) satisfies z.ZodType<DeepseekBalance>;
type CachedBalance = z.infer<typeof CachedBalance>;

const hasFunds = ({ available, totalUsd }: DeepseekBalance): boolean =>
  available && totalUsd > BALANCE_RESERVE_USD;

// One fixed-name instance ("global") shared by every ChatRoom, so the balance is checked once
// and one room's 402 gates the whole site.
export class RateLimiter extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS contact_counters (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS chat_buckets (
        visitor TEXT PRIMARY KEY,
        tokens REAL NOT NULL,
        refilled_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_daily_turns (
        day TEXT PRIMARY KEY,
        turns INTEGER NOT NULL
      );`
    );
  }

  private async cachedBalance(): Promise<CachedBalance | undefined> {
    return CachedBalance.safeParse(await this.ctx.storage.get(BALANCE_KEY)).data;
  }

  // The balance lookup awaits, so it runs first: the bucket and daily checks after it must not
  // yield, or two turns could both read the same last token.
  public async admitChatTurn({
    visitor,
    apiKey
  }: {
    visitor: VisitorKey;
    apiKey: string;
  }): Promise<ChatAdmission> {
    if (!(await this.chatFunded(apiKey))) return { allowed: false, reason: "balance" };
    return this.takeChatTurn(visitor);
  }

  private takeChatTurn(visitor: VisitorKey): ChatAdmission {
    const now = Date.now();
    const day = this.today(now);
    this.forgetFullBucketsAndPastDays({ now, day });
    const bucket = this.chatBucket(visitor) ?? { tokens: CHAT_BUCKET.capacity, refilledAt: now };
    const take = takeToken({ bucket, now, policy: CHAT_BUCKET });
    if (!take.taken) return { allowed: false, reason: "visitor" };
    if (this.chatTurnsOn(day) >= CHAT_DAILY_GLOBAL) return { allowed: false, reason: "site" };
    this.sql.exec(
      `INSERT INTO chat_buckets (visitor, tokens, refilled_at) VALUES (?, ?, ?)
       ON CONFLICT (visitor) DO UPDATE SET tokens = excluded.tokens, refilled_at = excluded.refilled_at`,
      visitor,
      take.bucket.tokens,
      take.bucket.refilledAt
    );
    this.sql.exec(
      `INSERT INTO chat_daily_turns (day, turns) VALUES (?, 1)
       ON CONFLICT (day) DO UPDATE SET turns = turns + 1`,
      day
    );
    return { allowed: true };
  }

  private forgetFullBucketsAndPastDays({ now, day }: { now: number; day: string }): void {
    this.sql.exec(
      `DELETE FROM chat_buckets WHERE refilled_at + (? - tokens) * ? <= ?`,
      CHAT_BUCKET.capacity,
      CHAT_BUCKET.msPerToken,
      now
    );
    this.sql.exec(`DELETE FROM chat_daily_turns WHERE day <> ?`, day);
  }

  private chatBucket(visitor: VisitorKey): TokenBucket | undefined {
    const [row] = this.sql
      .exec<{ tokens: number; refilled_at: number }>(
        `SELECT tokens, refilled_at FROM chat_buckets WHERE visitor = ?`,
        visitor
      )
      .toArray();
    return row && { tokens: row.tokens, refilledAt: row.refilled_at };
  }

  private chatTurnsOn(day: string): number {
    const [row] = this.sql
      .exec<{ turns: number }>(`SELECT turns FROM chat_daily_turns WHERE day = ?`, day)
      .toArray();
    return row?.turns ?? 0;
  }

  // Fails OPEN on a lookup error, since the next 402 catches an empty account.
  private async chatFunded(apiKey: string): Promise<boolean> {
    const cached = await this.cachedBalance();
    if (cached && Date.now() - cached.checkedAt < BALANCE_TTL_MS) return hasFunds(cached);
    try {
      const balance = await fetchDeepseekBalance(apiKey);
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

  public async markChatExhausted(): Promise<void> {
    await this.ctx.storage.put(BALANCE_KEY, {
      available: false,
      totalUsd: 0,
      checkedAt: Date.now()
    } satisfies CachedBalance);
  }

  // Synchronous so read-check-increment is atomic in the DO.
  public takeContactSlot(client: VisitorKey): ContactSlot {
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

  public contactUsage(client: VisitorKey): ContactUsage {
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

  private today(now = Date.now()): string {
    return new Date(now).toISOString().slice(0, 10);
  }
}
