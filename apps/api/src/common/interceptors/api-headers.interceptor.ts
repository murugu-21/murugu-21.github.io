import { defineMiddleware } from "hono/factory";

import { READ_POLICY } from "@murugappan/contracts/api/quotas.ts";
import type { ApiEnv } from "#src/common/app-env.ts";
import { versionHeaders, versionLinkHeader } from "#src/common/http/version-headers.ts";
import { readRateLimitHeaders } from "#src/modules/rate-limit/rate-limit-headers.ts";

export const apiHeadersInterceptor = defineMiddleware<ApiEnv>(async (c, next) => {
  await next();

  const headers = c.res.headers;
  for (const [name, value] of Object.entries(versionHeaders())) headers.set(name, value);
  if (!headers.has("Link")) headers.set("Link", versionLinkHeader());

  if (headers.has("RateLimit-Policy")) return;
  const slot = c.var.readSlot;
  const allowance = slot ? readRateLimitHeaders(slot) : { "RateLimit-Policy": READ_POLICY };
  for (const [name, value] of Object.entries(allowance)) headers.set(name, value);
});
