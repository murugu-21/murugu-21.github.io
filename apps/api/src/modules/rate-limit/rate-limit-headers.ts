// Spec: draft-ietf-httpapi-ratelimit-headers, plus the de-facto X-RateLimit-* trio (`-Reset` is delta-seconds).
import {
  CONTACT_CLIENT_QUOTA,
  CONTACT_GLOBAL_QUOTA,
  CONTACT_POLICY,
  READ_POLICY,
  READ_QUOTA
} from "@murugappan/contracts/api/quotas.ts";
import { rateLimitField, type Reported } from "@murugappan/content/rate-limit.ts";
import type { ReadSlot } from "#src/modules/rate-limit/read-quota.store.ts";

const clamp = (n: number) => Math.max(0, Math.floor(n));

export type RateLimitHeaders = {
  "RateLimit-Policy": string;
  RateLimit: string;
  "X-RateLimit-Limit": string;
  "X-RateLimit-Remaining": string;
  "X-RateLimit-Reset": string;
};

function rateLimitHeaders(policy: string, reported: Reported): RateLimitHeaders {
  const remaining = clamp(reported.remaining);
  const resetSeconds = clamp(reported.resetSeconds);
  return {
    "RateLimit-Policy": policy,
    RateLimit: rateLimitField({ quota: reported.quota, remaining, resetSeconds }),
    "X-RateLimit-Limit": String(reported.quota.quota),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(resetSeconds)
  };
}

export const readRateLimitHeaders = (slot: ReadSlot): RateLimitHeaders =>
  rateLimitHeaders(READ_POLICY, {
    quota: READ_QUOTA,
    remaining: slot.remaining,
    resetSeconds: slot.resetSeconds
  });

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

export const RATE_LIMIT_EXPOSED_HEADERS: readonly string[] = [
  "RateLimit",
  "RateLimit-Policy",
  "X-RateLimit-Limit",
  "X-RateLimit-Remaining",
  "X-RateLimit-Reset",
  "Retry-After"
];
