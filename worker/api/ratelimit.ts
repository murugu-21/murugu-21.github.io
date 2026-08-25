// Rate-limit signalling for the API, in the form agents can act on without
// reading prose: draft-ietf-httpapi-ratelimit-headers ("RateLimit header
// fields for HTTP") on every /api response, plus Retry-After on a 429.
//
// Field syntax, exactly as the draft defines it (Structured Fields, RFC 9651):
//   RateLimit-Policy: "name";q=<quota>;w=<window seconds>   (a list)
//   RateLimit:        "name";r=<remaining>;t=<seconds to reset>  (one policy)
// `RateLimit` reports the single policy closest to exhaustion, which is what
// a client has to obey.
//
// The de-facto X-RateLimit-Limit / -Remaining / -Reset trio is emitted
// alongside, because a great deal of tooling only looks for those. `-Reset` is
// delta-seconds, matching `t` above.
//
// Two quota families exist:
//   reads   — a fair-use ceiling, counted in the edge location serving the
//             request (see takeReadSlot). Generous enough that no legitimate
//             client meets it; it exists so the numbers in the headers are
//             real rather than a promise nothing enforces.
//   contact — the daily allowance POST /api/contact really spends, counted in
//             the RateLimiter Durable Object.

import {CONTACT_DAILY_GLOBAL, CONTACT_DAILY_PER_CLIENT} from "./contact";

export type Quota = {
  /** Policy name, quoted verbatim in both header fields. */
  name: string;
  quota: number;
  windowSeconds: number;
};

export const READ_QUOTA: Quota = {
  name: "reads",
  quota: 600,
  windowSeconds: 60
};

export const CONTACT_CLIENT_QUOTA: Quota = {
  name: "contact-client",
  quota: CONTACT_DAILY_PER_CLIENT,
  windowSeconds: 86_400
};

export const CONTACT_GLOBAL_QUOTA: Quota = {
  name: "contact-site",
  quota: CONTACT_DAILY_GLOBAL,
  windowSeconds: 86_400
};

export const CONTACT_QUOTAS: readonly Quota[] = [
  CONTACT_CLIENT_QUOTA,
  CONTACT_GLOBAL_QUOTA
];

/** `RateLimit-Policy`: the quota policies that apply, in declaration order. */
export function policyField(quotas: readonly Quota[]): string {
  return quotas
    .map(q => `"${q.name}";q=${q.quota};w=${q.windowSeconds}`)
    .join(", ");
}

const clamp = (n: number) => Math.max(0, Math.floor(n));

/** `RateLimit`: the live snapshot of one policy. */
export function rateLimitField(
  quota: Quota,
  remaining: number,
  resetSeconds: number
): string {
  return `"${quota.name}";r=${clamp(remaining)};t=${clamp(resetSeconds)}`;
}

/** The draft fields plus the de-facto `X-RateLimit-*` trio for one policy. */
export function rateLimitHeaders(
  policies: readonly Quota[],
  reported: {quota: Quota; remaining: number; resetSeconds: number}
): Record<string, string> {
  return {
    "RateLimit-Policy": policyField(policies),
    RateLimit: rateLimitField(
      reported.quota,
      reported.remaining,
      reported.resetSeconds
    ),
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

type Window = {resetAt: number; used: number};

// Fixed windows held in the isolate, not in a Durable Object: a read is a pure
// function of the deployed build, so paying a cross-region round trip to count
// it would cost more than the limit is worth. The consequence is that the
// ceiling is per edge location — documented as such on /developers/ — which
// only ever makes the effective allowance more generous than advertised.
const windows = new Map<string, Window>();

// Bound the map so a flood of distinct client addresses cannot grow it without
// limit; the oldest windows are the ones that have already reset.
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

/**
 * Spend one read slot for `client` and report what is left. Called once per
 * read request, so the numbers in the headers describe the window the caller
 * is actually in.
 */
export function takeReadSlot(client: string, now = Date.now()): ReadSlot {
  const windowMs = READ_QUOTA.windowSeconds * 1000;
  let window = windows.get(client);
  if (!window || window.resetAt <= now) {
    prune(now);
    window = {resetAt: now + windowMs, used: 0};
    windows.set(client, window);
  }
  const resetSeconds = Math.ceil((window.resetAt - now) / 1000);
  if (window.used >= READ_QUOTA.quota)
    return {allowed: false, remaining: 0, resetSeconds};
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
  rateLimitHeaders([READ_QUOTA], {
    quota: READ_QUOTA,
    remaining: slot.remaining,
    resetSeconds: slot.resetSeconds
  });

/**
 * Headers for a contact response. The reported policy is whichever tier has
 * less left, because that is the one that will stop the next request.
 */
export function contactRateLimitHeaders(usage: {
  clientRemaining: number;
  globalRemaining: number;
  resetSeconds: number;
}): Record<string, string> {
  const clientTighter = usage.clientRemaining <= usage.globalRemaining;
  return rateLimitHeaders(CONTACT_QUOTAS, {
    quota: clientTighter ? CONTACT_CLIENT_QUOTA : CONTACT_GLOBAL_QUOTA,
    remaining: clientTighter ? usage.clientRemaining : usage.globalRemaining,
    resetSeconds: usage.resetSeconds
  });
}

/** Seconds until the daily contact allowances reset (00:00 UTC). */
export function secondsUntilUtcMidnight(now = new Date()): number {
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );
  return Math.max(1, Math.ceil((midnight - now.getTime()) / 1000));
}

/** Headers exposed to browser clients so a page-side agent can read them. */
export const RATE_LIMIT_EXPOSED_HEADERS: readonly string[] = [
  "RateLimit",
  "RateLimit-Policy",
  "X-RateLimit-Limit",
  "X-RateLimit-Remaining",
  "X-RateLimit-Reset",
  "Retry-After"
];
