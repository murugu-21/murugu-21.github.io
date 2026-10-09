// Counts requests against the quotas in packages/contracts/api/quotas.ts and writes the headers: the
// draft fields plus the de-facto X-RateLimit-* trio most tooling reads (`-Reset` is delta-seconds).
//   RateLimit: "name";r=<remaining>;t=<seconds to reset>  (the policy closest to exhaustion)

import {
  CONTACT_CLIENT_QUOTA,
  CONTACT_GLOBAL_QUOTA,
  CONTACT_POLICY,
  READ_POLICY,
  READ_QUOTA,
  type Quota
} from "@murugappan/contracts/api/quotas.ts";

const clamp = (n: number) => Math.max(0, Math.floor(n));

type Reported = { quota: Quota; remaining: number; resetSeconds: number };

function rateLimitField({ quota, remaining, resetSeconds }: Reported): string {
  return `"${quota.name}";r=${clamp(remaining)};t=${clamp(resetSeconds)}`;
}

/** The draft fields plus the de-facto `X-RateLimit-*` trio, reporting one quota. */
function rateLimitHeaders(policy: string, reported: Reported): Record<string, string> {
  return {
    "RateLimit-Policy": policy,
    RateLimit: rateLimitField(reported),
    "X-RateLimit-Limit": String(reported.quota.quota),
    "X-RateLimit-Remaining": String(clamp(reported.remaining)),
    "X-RateLimit-Reset": String(clamp(reported.resetSeconds))
  };
}

export type ReadSlot = {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
};

type Window = { resetAt: number; used: number };

// Fixed windows in the isolate, not a DO, because a cross-region round trip per read costs more
// than the limit is worth. So the ceiling is per edge location, as /developers/ documents.
const windows = new Map<string, Window>();

// Caps memory under a flood of distinct addresses; insertion order drops the oldest first.
const MAX_TRACKED_CLIENTS = 20_000;

function prune(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
  if (windows.size <= MAX_TRACKED_CLIENTS) return;
  const excess = windows.size - MAX_TRACKED_CLIENTS;
  let dropped = 0;
  for (const key of windows.keys()) {
    windows.delete(key);
    if (++dropped >= excess) break;
  }
}

/** Spends one read slot for `client` and reports what is left. */
export function takeReadSlot(client: string, now = Date.now()): ReadSlot {
  const windowMs = READ_QUOTA.windowSeconds * 1000;
  let window = windows.get(client);
  if (!window || window.resetAt <= now) {
    prune(now);
    window = { resetAt: now + windowMs, used: 0 };
    windows.set(client, window);
  }
  const resetSeconds = Math.ceil((window.resetAt - now) / 1000);
  if (window.used >= READ_QUOTA.quota) return { allowed: false, remaining: 0, resetSeconds };
  window.used++;
  return {
    allowed: true,
    remaining: READ_QUOTA.quota - window.used,
    resetSeconds
  };
}

/** Test seam: drop every tracked window. */
export function resetReadWindows(): void {
  windows.clear();
}

export const readRateLimitHeaders = (slot: ReadSlot): Record<string, string> =>
  rateLimitHeaders(READ_POLICY, {
    quota: READ_QUOTA,
    remaining: slot.remaining,
    resetSeconds: slot.resetSeconds
  });

/** Reports whichever tier has less left: that is the one that stops the next request. */
export function contactRateLimitHeaders(usage: {
  clientRemaining: number;
  globalRemaining: number;
  resetSeconds: number;
}): Record<string, string> {
  const clientTighter = usage.clientRemaining <= usage.globalRemaining;
  return rateLimitHeaders(CONTACT_POLICY, {
    quota: clientTighter ? CONTACT_CLIENT_QUOTA : CONTACT_GLOBAL_QUOTA,
    remaining: clientTighter ? usage.clientRemaining : usage.globalRemaining,
    resetSeconds: usage.resetSeconds
  });
}

/** The one RateLimiter DO every caller shares, so allowances and the chat balance are global. */
export function globalLimiter(env: Env) {
  return env.RateLimiter.get(env.RateLimiter.idFromName("global"));
}

/** Seconds until the daily contact allowances reset (00:00 UTC). */
export function secondsUntilUtcMidnight(now = new Date()): number {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((midnight - now.getTime()) / 1000));
}

/** Exposed via CORS so a page-side agent can read them. */
export const RATE_LIMIT_EXPOSED_HEADERS: readonly string[] = [
  "RateLimit",
  "RateLimit-Policy",
  "X-RateLimit-Limit",
  "X-RateLimit-Remaining",
  "X-RateLimit-Reset",
  "Retry-After"
];
