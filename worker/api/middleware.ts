// Cross-cutting response headers for every API surface: the version contract
// (api/versioning.ts), the discovery Link relations, and the rate-limit
// signalling (api/ratelimit.ts). Kept here rather than in each handler so that
// no endpoint can be added without them.

import type {MiddlewareHandler} from "hono";

import {apiError} from "./errors";
import {
  CONTACT_QUOTAS,
  policyField,
  READ_QUOTA,
  readRateLimitHeaders,
  takeReadSlot,
  type ReadSlot
} from "./ratelimit";
import {API_PATHS, matchApiPath} from "./routes";
import {versionHeaders, versionLinkHeader} from "./versioning";

export type ApiHeaderOptions = {
  /**
   * Whether to answer 429 once the read ceiling is met. False for the OpenAPI
   * document: the description of the API has to stay reachable even for a
   * client that has just been throttled, or it cannot learn why.
   */
  enforceReads: boolean;
};

export function apiHeaders(
  opts: ApiHeaderOptions
): MiddlewareHandler<{Bindings: Env}> {
  return async (c, next) => {
    const pathname = new URL(c.req.url).pathname;
    const isContact = matchApiPath(pathname) === API_PATHS.contact;
    const isRead = c.req.method === "GET" || c.req.method === "HEAD";
    // No client address means every caller would share one window, which would
    // make the ceiling meaningless — so the policy is advertised and nothing is
    // counted. Cloudflare always sets this header in production.
    const client = c.req.header("CF-Connecting-IP");

    let slot: ReadSlot | null = null;
    if (isRead && !isContact && client) {
      slot = takeReadSlot(client);
      if (opts.enforceReads && !slot.allowed) {
        return apiError({
          status: 429,
          code: "rate_limited",
          message: `More than ${READ_QUOTA.quota} read requests in ${READ_QUOTA.windowSeconds} seconds from this client.`,
          hint: `Wait ${slot.resetSeconds} seconds. Read responses are cacheable for 5 minutes — reuse the ones you already have, and read the RateLimit header to see what is left.`,
          headers: {
            "Retry-After": String(slot.resetSeconds),
            ...readRateLimitHeaders(slot),
            ...versionHeaders(),
            Link: versionLinkHeader()
          }
        });
      }
    }

    await next();

    const headers = c.res.headers;
    for (const [name, value] of Object.entries(versionHeaders()))
      headers.set(name, value);
    if (!headers.has("Link")) headers.set("Link", versionLinkHeader());

    // A handler that already reported its own quota knows more than this
    // middleware does — POST /api/contact reports the allowance it just spent.
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
