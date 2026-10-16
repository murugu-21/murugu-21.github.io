import { cors } from "hono/cors";

import { META_EXPOSED_HEADERS } from "#src/common/http/version-headers.ts";
import { RATE_LIMIT_EXPOSED_HEADERS } from "#src/modules/rate-limit/rate-limit-headers.ts";

const DAY_SECONDS = 86400;

const exposeHeaders = [...RATE_LIMIT_EXPOSED_HEADERS, ...META_EXPOSED_HEADERS];

export const apiCorsMiddleware = cors({
  origin: "*",
  allowMethods: ["GET", "HEAD", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  exposeHeaders,
  maxAge: DAY_SECONDS
});

export const specCorsMiddleware = cors({
  origin: "*",
  allowMethods: ["GET", "HEAD", "OPTIONS"],
  exposeHeaders,
  maxAge: DAY_SECONDS
});

export const readOnlyCorsMiddleware = cors({
  origin: "*",
  allowMethods: ["GET", "HEAD", "OPTIONS"],
  maxAge: DAY_SECONDS
});

export const mcpCorsMiddleware = cors({
  origin: "*",
  allowMethods: ["POST", "OPTIONS"],
  allowHeaders: [
    "Content-Type",
    "Accept",
    "MCP-Protocol-Version",
    "Mcp-Method",
    "Mcp-Name",
    // Sent by older revisions' clients; accepted, then ignored.
    "Mcp-Session-Id",
    "Last-Event-ID"
  ],
  maxAge: DAY_SECONDS
});
