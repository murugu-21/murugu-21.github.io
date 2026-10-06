// Version, Link and rate-limit headers for every API response, applied here so no endpoint can
// be added without them.

import type { MiddlewareHandler } from "hono";
import { basePath } from "hono/route";

import { apiError } from "./errors";
import {
  CONTACT_QUOTAS,
  policyField,
  READ_QUOTA,
  readRateLimitHeaders,
  takeReadSlot
} from "./ratelimit";
import { versionHeaders, versionLinkHeader } from "./versioning";

type ApiHeaderOptions = {
  /** False for the OpenAPI document, because a throttled client must still be able to learn why. */
  enforceReads: boolean;
};

export function apiHeaders(opts: ApiHeaderOptions): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    // Path within the mount, so /api/contact and /api/v1/contact both match.
    const isContact = c.req.path.slice(basePath(c).length) === "/contact";
    const isRead = c.req.method === "GET" || c.req.method === "HEAD";
    // Without a client address every caller would share one window, so nothing is counted.
    // Cloudflare always sets this header in production.
    const client = c.req.header("CF-Connecting-IP");

    const slot = isRead && !isContact && client ? takeReadSlot(client) : null;
    if (slot && opts.enforceReads && !slot.allowed) {
      return apiError({
        status: 429,
        code: "rate_limited",
        message: `More than ${READ_QUOTA.quota} read requests in ${READ_QUOTA.windowSeconds} seconds from this client.`,
        hint: `Wait ${slot.resetSeconds} seconds. Read responses are cacheable for 5 minutes, so reuse the ones you already have, and read the RateLimit header to see what is left.`,
        headers: {
          "Retry-After": String(slot.resetSeconds),
          ...readRateLimitHeaders(slot),
          ...versionHeaders(),
          Link: versionLinkHeader()
        }
      });
    }

    await next();

    const headers = c.res.headers;
    for (const [name, value] of Object.entries(versionHeaders())) headers.set(name, value);
    if (!headers.has("Link")) headers.set("Link", versionLinkHeader());

    // POST /api/contact reports the allowance it just spent; don't overwrite it.
    if (headers.has("RateLimit-Policy")) return;

    if (isContact) {
      headers.set("RateLimit-Policy", policyField(CONTACT_QUOTAS));
      return;
    }
    if (!slot) {
      headers.set("RateLimit-Policy", policyField([READ_QUOTA]));
      return;
    }
    for (const [name, value] of Object.entries(readRateLimitHeaders(slot)))
      headers.set(name, value);
  };
}
