// POST /mcp, Streamable HTTP, dual-era (see ./protocol.ts). Always answers with
// a single JSON object. Nothing here streams, so there is no SSE.

import { Hono } from "hono";
import { cors } from "hono/cors";

import { API_VERSION } from "../api/versioning";
import { JsonObject } from "../../utils/json";
import {
  checkModernVersion,
  isAllowedOrigin,
  isModernRequest,
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_METHOD_NOT_FOUND,
  JSON_RPC_PARSE_ERROR,
  LATEST_PROTOCOL_VERSION,
  META_SERVER_INFO,
  negotiateLegacyVersion,
  parseMessage,
  SERVER_NAME,
  SUPPORTED_PROTOCOL_VERSIONS,
  validateModernHeaders,
  validateModernMeta,
  type JsonRpcId,
  type JsonRpcMessage,
  type RpcFailure
} from "./protocol";
import { BLOG_POST_TEMPLATE, listResources, readResource } from "./resources";
import { findTool, MCP_TOOLS, type McpTool, type ToolContext, type ToolResult } from "./tools";

const SERVER_INFO = { name: SERVER_NAME, version: API_VERSION };

const INSTRUCTIONS = `This server answers questions about one person: Murugappan M, a full stack engineer (TypeScript, Node.js, React, event-driven AWS) based in Bangalore, India, currently Software Engineer II at MedMe Health.

Use it when you need grounded, first-party facts about him rather than search results: what he has shipped and when, which technologies he has production experience with, what he has written about a technical topic, or to pass along a concrete opportunity. Call get_profile first. One request answers most questions. Use list_experience for dated per-role achievements, list_skills to check a specific technology, list_open_source for links that let you verify a claim at the source, and search_blog_posts then get_blog_post to read his writing in full.

Do not use it as a general search engine, a resume parser or a job-matching service, and do not expect data about anyone else. send_message emails him and is limited per day. Use it for one specific opportunity or question on a human's behalf, never for bulk outreach, and set dryRun to check a payload first.

Resources expose the same content as documents you can attach directly: the site summary (llms.txt), the agent instructions (AGENTS.md), the OpenAPI specification, and every blog post's markdown. Everything here is also plain HTTP. See https://murugappan.dev/openapi.json. This server's own manifest (server.json) is at https://murugappan.dev/.well-known/mcp.json.`;

const WIRE_TOOLS = MCP_TOOLS.map(tool => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: tool.inputSchema,
  outputSchema: tool.outputSchema,
  annotations: tool.annotations
}));

// Results only change on deploy; both fields are advisory.
const LIST_CACHE = { ttlMs: 3_600_000, cacheScope: "public" } as const;

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

function rpcError(
  id: JsonRpcId | undefined,
  failure: RpcFailure,
  extraHeaders: Record<string, string> = {}
): Response {
  return jsonResponse(
    {
      jsonrpc: "2.0",
      ...(id === undefined ? {} : { id }),
      error: {
        code: failure.code,
        message: failure.message,
        ...(failure.data === undefined ? {} : { data: failure.data })
      }
    },
    failure.status,
    extraHeaders
  );
}

function rpcResult(id: JsonRpcId, result: object): Response {
  return jsonResponse({ jsonrpc: "2.0", id, result });
}

function completeResult(id: JsonRpcId, result: object): Response {
  return rpcResult(id, {
    resultType: "complete",
    ...result,
    _meta: { [META_SERVER_INFO]: SERVER_INFO }
  });
}

// No `listChanged` or `subscribe`, because this server sends no notifications.
const CAPABILITIES = { tools: {}, resources: {} };

const DISCOVER_RESULT = {
  supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
  capabilities: CAPABILITIES,
  instructions: INSTRUCTIONS,
  ...LIST_CACHE
};

function invalidParams(message: string, data?: unknown): RpcFailure {
  return { status: 200, code: JSON_RPC_INVALID_PARAMS, message, data };
}

const isFailure = (value: object): value is RpcFailure => "code" in value;

async function readResourceResult(
  message: JsonRpcMessage,
  ctx: ToolContext
): Promise<{ contents: unknown[] } | RpcFailure> {
  const uri = message.params?.uri;
  if (typeof uri !== "string") {
    return invalidParams("Invalid params: 'uri' is required and must be a string.");
  }
  const contents = await readResource(uri, ctx);
  if (contents === null) {
    return invalidParams(
      "Resource not found. Call resources/list for the resources this server offers.",
      { uri }
    );
  }
  return { contents };
}

function toolCallArgs(
  message: JsonRpcMessage
): { tool: McpTool; args: Record<string, unknown> } | RpcFailure {
  const name = message.params?.name;
  if (typeof name !== "string") {
    return invalidParams("Invalid params: 'name' is required and must be a string.");
  }
  // Only a missing value defaults; `null` is still rejected.
  const args = JsonObject.default({}).safeParse(message.params?.arguments);
  if (!args.success) {
    return invalidParams("Invalid params: 'arguments' must be an object when present.");
  }
  const tool = findTool(name);
  if (!tool) {
    return invalidParams(
      `Unknown tool: ${name}. Call tools/list for the tools this server offers.`
    );
  }
  return { tool, args: args.data };
}

async function runTool(
  message: JsonRpcMessage,
  ctx: ToolContext
): Promise<ToolResult | RpcFailure> {
  const parsed = toolCallArgs(message);
  if (isFailure(parsed)) return parsed;
  return parsed.tool.run(parsed.args, ctx);
}

const toolCallResult = (result: ToolResult) => ({
  content: result.content,
  ...(result.structuredContent === undefined
    ? {}
    : { structuredContent: result.structuredContent }),
  isError: result.isError === true
});

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

mcp.post("*", async c => {
  if (!isAllowedOrigin(c.req.header("Origin") ?? null)) {
    return rpcError(undefined, {
      status: 403,
      code: JSON_RPC_INVALID_REQUEST,
      message:
        "Forbidden: the Origin header is not a web origin. The MCP endpoint accepts requests with no Origin, or with an http/https origin."
    });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await c.req.text());
  } catch {
    return rpcError(undefined, {
      status: 400,
      code: JSON_RPC_PARSE_ERROR,
      message: "Parse error: the request body is not valid JSON."
    });
  }

  const parsed = parseMessage(raw);
  if (!parsed.ok) return rpcError(undefined, parsed.failure);
  const message = parsed.message;

  if (message.id === undefined) return new Response(null, { status: 202 });
  const id = message.id;

  const ctx: ToolContext = {
    assets: c.env.ASSETS,
    env: c.env,
    clientIp: c.req.header("CF-Connecting-IP") ?? "unknown"
  };

  if (isModernRequest(message)) {
    const failure =
      validateModernHeaders(message, c.req.raw.headers) ??
      validateModernMeta(message) ??
      checkModernVersion(message);
    if (failure) return rpcError(id, failure);

    const complete = (result: object) => completeResult(id, result);

    switch (message.method) {
      case "server/discover":
        return complete(DISCOVER_RESULT);
      case "tools/list":
        return complete({ tools: WIRE_TOOLS, ...LIST_CACHE });
      case "resources/list":
        return complete({
          resources: await listResources(ctx),
          ...LIST_CACHE
        });
      case "resources/templates/list":
        return complete({
          resourceTemplates: [BLOG_POST_TEMPLATE],
          ...LIST_CACHE
        });
      case "resources/read": {
        const result = await readResourceResult(message, ctx);
        return isFailure(result) ? rpcError(id, result) : complete(result);
      }
      case "tools/call": {
        const result = await runTool(message, ctx);
        return isFailure(result) ? rpcError(id, result) : complete(toolCallResult(result));
      }
      default:
        // The transport requires 404 to distinguish this from a non-MCP endpoint.
        return rpcError(id, {
          status: 404,
          code: JSON_RPC_METHOD_NOT_FOUND,
          message: `Method not found: ${message.method}. This server implements server/discover, tools/list, tools/call, resources/list, resources/templates/list and resources/read.`
        });
    }
  }

  // Legacy era. It answers `server/discover` too, so a probe without metadata
  // learns the supported versions.
  switch (message.method) {
    case "server/discover":
      return completeResult(id, DISCOVER_RESULT);
    case "initialize":
      return rpcResult(id, {
        protocolVersion: negotiateLegacyVersion(message.params?.protocolVersion),
        capabilities: CAPABILITIES,
        serverInfo: SERVER_INFO,
        instructions: `${INSTRUCTIONS}\n\nProtocol versions supported by this server: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")} (latest: ${LATEST_PROTOCOL_VERSION}).`
      });
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: WIRE_TOOLS });
    case "resources/list":
      return rpcResult(id, { resources: await listResources(ctx) });
    case "resources/templates/list":
      return rpcResult(id, { resourceTemplates: [BLOG_POST_TEMPLATE] });
    case "resources/read": {
      const result = await readResourceResult(message, ctx);
      return isFailure(result) ? rpcError(id, result) : rpcResult(id, result);
    }
    case "tools/call": {
      const result = await runTool(message, ctx);
      return isFailure(result) ? rpcError(id, result) : rpcResult(id, toolCallResult(result));
    }
    default:
      // 200, not 404, because a 4xx sends legacy clients probing the old HTTP+SSE transport.
      return rpcError(id, {
        status: 200,
        code: JSON_RPC_METHOD_NOT_FOUND,
        message: `Method not found: ${message.method}. This server implements initialize, ping, tools/list, tools/call, resources/list, resources/templates/list and resources/read. Protocol versions supported: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}.`
      });
  }
});

// This revision defines no GET stream and no DELETE session termination.
mcp.all("*", c =>
  rpcError(
    undefined,
    {
      status: 405,
      code: JSON_RPC_METHOD_NOT_FOUND,
      message: `${c.req.method} is not supported on the MCP endpoint. This revision of Streamable HTTP defines POST only. There is no GET stream and no session to DELETE.`
    },
    { Allow: "POST, OPTIONS" }
  )
);
