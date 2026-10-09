// /mcp, Streamable HTTP over POST (the SDK answers GET and DELETE with 405). The SDK serves
// both eras from one server definition: 2026-07-28 requests statelessly, `initialize`-era
// ones through its stateless fallback.

import {
  createMcpHandler,
  INVALID_REQUEST,
  McpServer,
  type CacheHint
} from "@modelcontextprotocol/server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { API_VERSION } from "@murugappan/contracts/api/versioning.ts";
import { SERVER_NAME, SUPPORTED_PROTOCOL_VERSIONS } from "@murugappan/contracts/mcp.ts";
import { registerResources } from "./resources";
import { registerTools, type ToolContext } from "./tools";

const INSTRUCTIONS = `This server answers questions about one person: Murugappan M, a full stack engineer (TypeScript, Node.js, React, event-driven AWS) based in Bangalore, India, currently Software Engineer II at MedMe Health.

Use it when you need grounded, first-party facts about him rather than search results: what he has shipped and when, which technologies he has production experience with, what he has written about a technical topic, or to pass along a concrete opportunity. Call get_profile first. One request answers most questions. Use list_experience for dated per-role achievements, list_skills to check a specific technology, list_open_source for links that let you verify a claim at the source, and search_blog_posts then get_blog_post to read his writing in full.

Do not use it as a general search engine, a resume parser or a job-matching service, and do not expect data about anyone else. send_message emails him and is limited per day. Use it for one specific opportunity or question on a human's behalf, never for bulk outreach, and set dryRun to check a payload first.

Resources expose the same content as documents you can attach directly: the site summary (llms.txt), the agent instructions (AGENTS.md), the OpenAPI specification, and every blog post's markdown. Everything here is also plain HTTP. See https://murugappan.dev/openapi.json. This server's own manifest (server.json) is at https://murugappan.dev/.well-known/mcp.json.`;

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

// Results only change on deploy; both fields are advisory.
const LIST_CACHE: CacheHint = { ttlMs: 3_600_000, cacheScope: "public" };

function buildServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: API_VERSION },
    {
      supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
      instructions: INSTRUCTIONS,
      // The SDK defaults listChanged to true, but this server never sends a notification.
      capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
      cacheHints: {
        "server/discover": LIST_CACHE,
        "tools/list": LIST_CACHE,
        "resources/list": LIST_CACHE,
        "resources/templates/list": LIST_CACHE
      }
    }
  );
  registerTools(server, ctx);
  registerResources(server);
  return server;
}

export const mcp = new Hono<{ Bindings: Env }>();

mcp.use(
  "*",
  cors({
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
    maxAge: 86400
  })
);

mcp.all("*", async c => {
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
  const ctx: ToolContext = {
    env: c.env,
    clientIp: c.req.header("CF-Connecting-IP") ?? "unknown"
  };
  // A handler per request: the SDK's factory sees the Request but not the bindings the tools read.
  return createMcpHandler(() => buildServer(ctx), {
    // The SDK reports its internal 500s only here. 4xx rejections arrive too and are logged on
    // purpose: telling them apart would mean matching the SDK's message strings.
    onerror: error => console.error("mcp handler error", error)
  }).fetch(c.req.raw);
});
