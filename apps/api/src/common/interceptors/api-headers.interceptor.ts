import { defineMiddleware } from "hono/factory";

import { CONTACT_POLICY, READ_POLICY } from "@murugappan/contracts/api/quotas.ts";
import type { ApiEnv } from "#src/common/app-env.ts";
import { versionHeaders, versionLinkHeader } from "#src/common/http/version-headers.ts";
import {
  readRateLimitHeaders,
  type RateLimitHeaders
} from "#src/modules/rate-limit/rate-limit-headers.ts";
import type { ReadSlot } from "#src/modules/rate-limit/read-quota.store.ts";

function allowanceHeaders({
  isContact,
  slot
}: {
  isContact: boolean;
  slot: ReadSlot | null;
}): RateLimitHeaders | Pick<RateLimitHeaders, "RateLimit-Policy"> {
  if (isContact) return { "RateLimit-Policy": CONTACT_POLICY };
  return slot ? readRateLimitHeaders(slot) : { "RateLimit-Policy": READ_POLICY };
}

export const apiHeadersInterceptor = defineMiddleware<ApiEnv>(async (c, next) => {
  await next();

  const headers = c.res.headers;
  for (const [name, value] of Object.entries(versionHeaders())) headers.set(name, value);
  if (!headers.has("Link")) headers.set("Link", versionLinkHeader());

  if (headers.has("RateLimit-Policy")) return;
  const allowance = allowanceHeaders({ isContact: c.var.isContact, slot: c.var.readSlot });
  for (const [name, value] of Object.entries(allowance)) headers.set(name, value);
});
