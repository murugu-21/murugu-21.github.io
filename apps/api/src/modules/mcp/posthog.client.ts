import type { McpServer } from "@modelcontextprotocol/server";
import { instrument, type BeforeSendFn } from "@posthog/mcp";
import type { Context } from "hono";
import { PostHog } from "posthog-node";
import { z } from "zod";

import { MCP_TOOLS } from "@murugappan/contracts/mcp.ts";
import type { AppEnv } from "#src/common/app-env.ts";

const POSTHOG_SERVER_INGEST_HOST = "https://us.i.posthog.com";

const ReadToolName = z.enum(MCP_TOOLS.filter(tool => tool.kind === "read").map(tool => tool.name));

const keepReadArgumentsOnly: BeforeSendFn = event => {
  if (event.event !== "$mcp_tool_call") return event;
  if (ReadToolName.safeParse(event.properties.$mcp_tool_name).success) return event;
  const { $mcp_parameters: _, ...properties } = event.properties;
  return { ...event, properties };
};

type McpAnalytics = {
  instrument: (server: McpServer) => void;
  flushAfterBody: (response: Response) => Response;
};

const ignoreClientHangup = () => {};

export function mcpAnalytics(c: Context<AppEnv>): McpAnalytics | null {
  const token = c.env.POSTHOG_PROJECT_TOKEN.trim();
  if (!token) return null;
  const posthog = new PostHog(token, { host: POSTHOG_SERVER_INGEST_HOST });
  const shutdown = () =>
    posthog.shutdown().catch((cause: unknown) => console.error("posthog flush failed", cause));
  return {
    instrument: server => {
      instrument(server, posthog, { beforeSend: keepReadArgumentsOnly });
    },
    flushAfterBody: response => {
      if (!response.body) {
        c.executionCtx.waitUntil(shutdown());
        return response;
      }
      // A streamed reply runs the tool while the body is read, so flush once the body has ended.
      const { readable, writable } = new TransformStream();
      c.executionCtx.waitUntil(
        response.body.pipeTo(writable).catch(ignoreClientHangup).then(shutdown)
      );
      return new Response(readable, response);
    }
  };
}
