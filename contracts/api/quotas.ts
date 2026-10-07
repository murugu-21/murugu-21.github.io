// The published quotas, advertised as a draft-ietf-httpapi-ratelimit-headers field (RFC 9651):
//   RateLimit-Policy: "name";q=<quota>;w=<window seconds>   (a list)
// worker/api/ratelimit.ts counts against them: reads per edge, contact in the RateLimiter DO.

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

const policyField = (quotas: readonly Quota[]): string =>
  quotas.map(q => `"${q.name}";q=${q.quota};w=${q.windowSeconds}`).join(", ");

/** The `RateLimit-Policy` value on read responses. */
export const READ_POLICY = policyField([READ_QUOTA]);
/** The `RateLimit-Policy` value on contact responses, client tier first. */
export const CONTACT_POLICY = policyField([CONTACT_CLIENT_QUOTA, CONTACT_GLOBAL_QUOTA]);
