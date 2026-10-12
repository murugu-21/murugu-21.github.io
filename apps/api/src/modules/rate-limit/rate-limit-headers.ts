// Writes the draft RateLimit fields plus the de-facto X-RateLimit-* trio most tooling reads (`-Reset` is delta-seconds).
//   RateLimit: "name";r=<remaining>;t=<seconds to reset>  (the policy closest to exhaustion)

import {
  CONTACT_CLIENT_QUOTA,
  CONTACT_GLOBAL_QUOTA,
  CONTACT_POLICY,
  READ_POLICY,
  READ_QUOTA,
  type Quota
} from "@murugappan/contracts/api/quotas.ts";
import type { ReadSlot } from "#src/modules/rate-limit/read-quota.store.ts";

const clamp = (n: number) => Math.max(0, Math.floor(n));

type Reported = { quota: Quota; remaining: number; resetSeconds: number };

function rateLimitField({ quota, remaining, resetSeconds }: Reported): string {
  return `"${quota.name}";r=${clamp(remaining)};t=${clamp(resetSeconds)}`;
}

export type RateLimitHeaders = {
  "RateLimit-Policy": string;
  RateLimit: string;
  "X-RateLimit-Limit": string;
  "X-RateLimit-Remaining": string;
  "X-RateLimit-Reset": string;
};

function rateLimitHeaders(policy: string, reported: Reported): RateLimitHeaders {
  return {
    "RateLimit-Policy": policy,
    RateLimit: rateLimitField(reported),
    "X-RateLimit-Limit": String(reported.quota.quota),
    "X-RateLimit-Remaining": String(clamp(reported.remaining)),
    "X-RateLimit-Reset": String(clamp(reported.resetSeconds))
  };
}

export const readRateLimitHeaders = (slot: ReadSlot): RateLimitHeaders =>
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
}): RateLimitHeaders {
  const clientTighter = usage.clientRemaining <= usage.globalRemaining;
  return rateLimitHeaders(CONTACT_POLICY, {
    quota: clientTighter ? CONTACT_CLIENT_QUOTA : CONTACT_GLOBAL_QUOTA,
    remaining: clientTighter ? usage.clientRemaining : usage.globalRemaining,
    resetSeconds: usage.resetSeconds
  });
}

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
