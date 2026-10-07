// draft-ietf-httpapi-ratelimit-headers fields (RFC 9651 syntax), plus the de-facto X-RateLimit-*
// trio that most tooling reads (`-Reset` is delta-seconds):
//   RateLimit-Policy: "name";q=<quota>;w=<window seconds>   (a list)
//   RateLimit:        "name";r=<remaining>;t=<seconds to reset>  (the policy closest to exhaustion)
// The published quotas. worker/api/ratelimit.ts counts against them: reads per edge,
// contact in the RateLimiter DO.

import { CONTACT_DAILY_GLOBAL, CONTACT_DAILY_PER_CLIENT } from "./contact";

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

export const CONTACT_QUOTAS: readonly Quota[] = [CONTACT_CLIENT_QUOTA, CONTACT_GLOBAL_QUOTA];

/** `RateLimit-Policy`, in declaration order. */
export function policyField(quotas: readonly Quota[]): string {
  return quotas.map(q => `"${q.name}";q=${q.quota};w=${q.windowSeconds}`).join(", ");
}
