// Version, Link and rate-limit headers for every API response, applied here so no endpoint can
// be added without them.

import { defineMiddleware } from "hono/factory";

import { CONTACT_POLICY, READ_POLICY } from "@murugappan/contracts/api/quotas.ts";
import type { ApiEnv } from "#src/common/app-env.ts";
import { versionHeaders, versionLinkHeader } from "#src/common/http/version-headers.ts";
import { readRateLimitHeaders } from "#src/modules/rate-limit/rate-limit-headers.ts";
import type { ReadSlot } from "#src/modules/rate-limit/read-quota.store.ts";

function allowanceHeaders({
  isContact,
  slot
}: {
  isContact: boolean;
  slot: ReadSlot | null;
}): Record<string, string> {
  if (isContact) return { "RateLimit-Policy": CONTACT_POLICY };
  return slot ? readRateLimitHeaders(slot) : { "RateLimit-Policy": READ_POLICY };
}

/** Runs after `readThrottleGuard`, which leaves `readSlot` and `isContact` for it. */
export const apiHeadersInterceptor = defineMiddleware<ApiEnv>(async (c, next) => {
  await next();

  const headers = c.res.headers;
  for (const [name, value] of Object.entries(versionHeaders())) headers.set(name, value);
  if (!headers.has("Link")) headers.set("Link", versionLinkHeader());

  // POST /api/contact reports the allowance it just spent; don't overwrite it.
  if (headers.has("RateLimit-Policy")) return;
  const allowance = allowanceHeaders({ isContact: c.var.isContact, slot: c.var.readSlot });
  for (const [name, value] of Object.entries(allowance)) headers.set(name, value);
});
