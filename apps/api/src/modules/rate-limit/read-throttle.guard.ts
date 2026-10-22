import { defineMiddleware } from "hono/factory";
import { basePath } from "hono/route";

import type { ApiEnv } from "#src/common/app-env.ts";
import { apiError } from "#src/common/http/api-error.ts";
import { versionHeaders, versionLinkHeader } from "#src/common/http/version-headers.ts";
import { readRateLimitHeaders } from "#src/modules/rate-limit/rate-limit-headers.ts";
import {
  READ_LIMIT_MESSAGE,
  takeReadSlot,
  type ReadSlot
} from "#src/modules/rate-limit/read-quota.store.ts";
import { parseVisitor } from "#src/modules/rate-limit/visitor-key.ts";

function throttled(slot: ReadSlot): Response {
  return apiError({
    status: 429,
    code: "rate_limited",
    message: READ_LIMIT_MESSAGE,
    hint: `Wait ${slot.resetSeconds} seconds. Read responses are cacheable for 5 minutes, so reuse the ones you already have, and read the RateLimit header to see what is left.`,
    headers: {
      "Retry-After": String(slot.resetSeconds),
      ...readRateLimitHeaders(slot),
      ...versionHeaders(),
      Link: versionLinkHeader()
    }
  });
}

export const readThrottleGuard = ({ enforce }: { enforce: boolean }) =>
  defineMiddleware<ApiEnv>(async (c, next) => {
    const isContact = c.req.path.slice(basePath(c).length) === "/contact";
    const isRead = c.req.method === "GET" || c.req.method === "HEAD";
    // Without a client address every caller would share one window, so nothing is counted.
    // Cloudflare always sets this header in production.
    const visitor = parseVisitor(c.req.header("CF-Connecting-IP"));

    const slot = isRead && !isContact && visitor ? takeReadSlot(visitor) : null;
    if (slot && enforce && !slot.allowed) return throttled(slot);

    c.set("readSlot", slot);
    c.set("isContact", isContact);
    await next();
  });
