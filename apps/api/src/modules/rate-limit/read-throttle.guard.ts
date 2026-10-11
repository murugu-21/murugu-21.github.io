import { createMiddleware } from "hono/factory";
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

/**
 * Counts every API read against the client's window. `enforce` is false for the OpenAPI
 * document, because a throttled client must still be able to learn why.
 */
export const readThrottleGuard = ({ enforce }: { enforce: boolean }) =>
  createMiddleware<ApiEnv>(async (c, next) => {
    // Path within the mount, so /api/contact and /api/v1/contact both match.
    const isContact = c.req.path.slice(basePath(c).length) === "/contact";
    const isRead = c.req.method === "GET" || c.req.method === "HEAD";
    // Without a client address every caller would share one window, so nothing is counted.
    // Cloudflare always sets this header in production.
    const client = c.req.header("CF-Connecting-IP");

    const slot = isRead && !isContact && client ? takeReadSlot(client) : null;
    if (slot && enforce && !slot.allowed) return throttled(slot);

    c.set("readSlot", slot);
    c.set("isContact", isContact);
    await next();
  });
