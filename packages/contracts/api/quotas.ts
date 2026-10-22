// Spec: draft-ietf-httpapi-ratelimit-headers (RateLimit-Policy as an RFC 9651 structured field).
import { CONTACT_DAILY_GLOBAL, CONTACT_DAILY_PER_CLIENT } from "./contact";

export type Quota = {
  name: string;
  quota: number;
  windowSeconds: number;
};

export const READ_CACHE_MINUTES = 5;

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

export const READ_POLICY = policyField([READ_QUOTA]);
export const CONTACT_POLICY = policyField([CONTACT_CLIENT_QUOTA, CONTACT_GLOBAL_QUOTA]);
