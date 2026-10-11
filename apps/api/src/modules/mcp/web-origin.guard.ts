import { INVALID_REQUEST } from "@modelcontextprotocol/server";
import { createMiddleware } from "hono/factory";

import type { AppEnv } from "#src/common/app-env.ts";

/**
 * DNS-rebinding guard. The server is public with no ambient credentials, so any
 * web origin is allowed; an opaque "null", `file:`, app schemes and garbage are not.
 */
function isAllowedOrigin(origin: string | null): boolean {
  if (origin === null) return true; // a non-browser client sends no Origin header
  try {
    const { protocol } = new URL(origin);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Answers a JSON-RPC 403, since only the MCP endpoint uses it. */
export const webOriginGuard = createMiddleware<AppEnv>(async (c, next) => {
  if (!isAllowedOrigin(c.req.header("Origin") ?? null)) {
    return c.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: INVALID_REQUEST,
          message:
            "Forbidden: the Origin header is not a web origin. The MCP endpoint accepts requests with no Origin, or with an http/https origin."
        }
      },
      403
    );
  }
  await next();
});
