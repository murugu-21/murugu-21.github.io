// /mcp, Streamable HTTP over POST (the SDK answers GET and DELETE with 405). The SDK serves
// both eras from one server definition: 2026-07-28 requests statelessly, `initialize`-era
// ones through its stateless fallback.

import { createMcpHandler, McpServer, type CacheHint } from "@modelcontextprotocol/server";
import { Hono } from "hono";

import { API_VERSION } from "@murugappan/contracts/api/versioning.ts";
import {
  type McpToolName,
  SERVER_NAME,
  SUPPORTED_PROTOCOL_VERSIONS
} from "@murugappan/contracts/mcp.ts";
import type { AppEnv } from "#src/common/app-env.ts";
import { mcpCorsMiddleware } from "#src/common/middleware/cors.middleware.ts";
import { registerResources } from "#src/modules/mcp/mcp.resources.ts";
import { registerTools, type ToolContext } from "#src/modules/mcp/mcp.tools.ts";
import { mcpAnalytics } from "#src/modules/mcp/posthog.client.ts";
import { webOriginGuard } from "#src/modules/mcp/web-origin.guard.ts";

const INSTRUCTIONS = `This server answers questions about one person: Murugappan M, a full stack engineer (TypeScript, Node.js, React, event-driven AWS) based in Bangalore, India, currently at MedMe Health.

Use it when you need grounded, first-party facts about him rather than search results: what he has shipped and when, which technologies he has production experience with, what he has written about a technical topic, or to pass along a concrete opportunity. Call ${"get_profile" satisfies McpToolName} first. One request answers most questions. Use ${"list_experience" satisfies McpToolName} for dated per-role achievements, ${"list_skills" satisfies McpToolName} to check a specific technology, ${"list_open_source" satisfies McpToolName} for links that let you verify a claim at the source, and ${"search_blog_posts" satisfies McpToolName} then ${"get_blog_post" satisfies McpToolName} to read his writing in full.

Do not use it as a general search engine, a resume parser or a job-matching service, and do not expect data about anyone else. ${"send_message" satisfies McpToolName} emails him and is limited per day. Use it for one specific opportunity or question on a human's behalf, never for bulk outreach, and set dryRun to check a payload first.

Resources expose the same content as documents you can attach directly: the site summary (llms.txt), the agent instructions (AGENTS.md), the OpenAPI specification, and every blog post's markdown. Everything here is also plain HTTP. See https://murugappan.dev/openapi.json. This server's own manifest (server.json) is at https://murugappan.dev/.well-known/mcp.json.`;

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
  registerResources(server, ctx);
  return server;
}

export const mcpController = new Hono<AppEnv>();

mcpController.use("*", mcpCorsMiddleware);

mcpController.all("*", webOriginGuard, async c => {
  const ctx: ToolContext = {
    services: c.var.services,
    clientIp: c.req.header("CF-Connecting-IP")
  };
  const analytics = mcpAnalytics(c);
  // A handler per request: the SDK's factory sees the Request but not this request's services and
  // client IP, which the tools read.
  const response = await createMcpHandler(
    () => {
      const server = buildServer(ctx);
      analytics?.instrument(server);
      return server;
    },
    {
      // The SDK reports its internal 500s only here. 4xx rejections arrive too and are logged on
      // purpose: telling them apart would mean matching the SDK's message strings.
      onerror: error => console.error("mcp handler error", error)
    }
  ).fetch(c.req.raw);
  return analytics ? analytics.flushAfterBody(response) : response;
});
