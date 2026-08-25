// The MCP endpoint: POST /mcp, Streamable HTTP, dual-era (see ./protocol.ts).
// Responses are always a single `application/json` object — the spec lets a
// server choose that over an SSE stream per request, and nothing here streams
// or reports progress, so there is no reason to open one.

import {Hono} from "hono";
import {cors} from "hono/cors";

import {API_VERSION} from "../api/openapi";
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
import {BLOG_POST_TEMPLATE, listResources, readResource} from "./resources";
import {findTool, MCP_TOOLS, type ToolContext, type ToolResult} from "./tools";

const SERVER_INFO = {name: SERVER_NAME, version: API_VERSION};

// Natural-language guidance for the calling model, per DiscoverResult
// `instructions` / legacy InitializeResult `instructions`.
const INSTRUCTIONS = `This server answers questions about one person: Murugappan M, a full stack engineer (TypeScript, Node.js, React, event-driven AWS) based in Bangalore, India, currently Software Engineer II at MedMe Health.

Use it when you need grounded, first-party facts about him rather than search results: what he has shipped and when, which technologies he has production experience with, what he has written about a technical topic, or to pass along a concrete opportunity. Call get_profile first — one request answers most questions. Use list_experience for dated per-role achievements, list_skills to check a specific technology, list_open_source for links that let you verify a claim at the source, and search_blog_posts then get_blog_post to read his writing in full.

Do not use it as a general search engine, a resume parser or a job-matching service, and do not expect data about anyone else. send_message emails him and is limited per day — use it for one specific opportunity or question on a human's behalf, never for bulk outreach, and set dryRun to check a payload first.

Resources expose the same content as documents you can attach directly: the site summary (llms.txt), the agent instructions (AGENTS.md), the OpenAPI specification, and every blog post's markdown. Everything here is also plain HTTP — see https://murugappan.dev/openapi.json. This server's own manifest (server.json) is at https://murugappan.dev/.well-known/mcp.json.`;

// Tool definitions are wire data only — the executable `run` stays server-side.
const WIRE_TOOLS = MCP_TOOLS.map(tool => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: tool.inputSchema,
  outputSchema: tool.outputSchema,
  annotations: tool.annotations
}));

// Read results are pure functions of the deployed build; an hour is well inside
// how often the site redeploys, and both fields are advisory to the client.
const LIST_CACHE = {ttlMs: 3_600_000, cacheScope: "public"} as const;

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
      ...(id === undefined ? {} : {id}),
      error: {
        code: failure.code,
        message: failure.message,
        ...(failure.data === undefined ? {} : {data: failure.data})
      }
    },
    failure.status,
    extraHeaders
  );
}

function rpcResult(id: JsonRpcId, result: object): Response {
  return jsonResponse({jsonrpc: "2.0", id, result});
}

const discoverResult = () => ({
  supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
  // Neither `listChanged` nor `subscribe`: this server pushes nothing, so
  // declaring either would promise notifications that never arrive.
  capabilities: CAPABILITIES,
  instructions: INSTRUCTIONS,
  ...LIST_CACHE
});

const CAPABILITIES = {tools: {}, resources: {}};

/** A resources/read that resolved to nothing is an Invalid Params failure. */
function resourceNotFound(uri: unknown): RpcFailure {
  return {
    status: 200,
    code: JSON_RPC_INVALID_PARAMS,
    message:
      "Resource not found. Call resources/list for the resources this server offers.",
    data: {uri}
  };
}

async function readResourceResult(
  message: JsonRpcMessage,
  ctx: ToolContext
): Promise<{contents: unknown[]} | RpcFailure> {
  const uri = message.params?.uri;
  if (typeof uri !== "string") {
    return {
      status: 200,
      code: JSON_RPC_INVALID_PARAMS,
      message: "Invalid params: 'uri' is required and must be a string."
    };
  }
  const contents = await readResource(uri, ctx);
  return contents === null ? resourceNotFound(uri) : {contents};
}

function toolCallArgs(
  message: JsonRpcMessage
): {name: string; args: Record<string, unknown>} | RpcFailure {
  const name = message.params?.name;
  if (typeof name !== "string") {
    return {
      status: 200,
      code: JSON_RPC_INVALID_PARAMS,
      message: "Invalid params: 'name' is required and must be a string."
    };
  }
  const raw = message.params?.arguments;
  if (
    raw !== undefined &&
    (typeof raw !== "object" || raw === null || Array.isArray(raw))
  ) {
    return {
      status: 200,
      code: JSON_RPC_INVALID_PARAMS,
      message: "Invalid params: 'arguments' must be an object when present."
    };
  }
  if (!findTool(name)) {
    return {
      status: 200,
      code: JSON_RPC_INVALID_PARAMS,
      message: `Unknown tool: ${name}. Call tools/list for the tools this server offers.`
    };
  }
  return {name, args: (raw as Record<string, unknown>) ?? {}};
}

async function runTool(
  message: JsonRpcMessage,
  ctx: ToolContext
): Promise<ToolResult | RpcFailure> {
  const parsed = toolCallArgs(message);
  if ("code" in parsed) return parsed;
  return findTool(parsed.name)!.run(parsed.args, ctx);
}

const isFailure = (value: object): value is RpcFailure => "code" in value;

export const mcp = new Hono<{Bindings: Env}>();

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
      // Sent by clients on the earlier Streamable HTTP revisions. Accepted at
      // the CORS layer and then ignored — this server mints no sessions and its
      // streams are not resumable.
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

  // Notifications get no response body on either era.
  if (message.id === undefined) return new Response(null, {status: 202});
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

    const complete = (result: object) =>
      rpcResult(id, {
        resultType: "complete",
        ...result,
        _meta: {[META_SERVER_INFO]: SERVER_INFO}
      });

    switch (message.method) {
      case "server/discover":
        return complete(discoverResult());
      case "tools/list":
        return complete({tools: WIRE_TOOLS, ...LIST_CACHE});
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
        return isFailure(result)
          ? rpcError(id, result)
          : complete({
              content: result.content,
              ...(result.structuredContent === undefined
                ? {}
                : {structuredContent: result.structuredContent}),
              isError: result.isError === true
            });
      }
      default:
        // The transport requires 404 here so a client can tell an unimplemented
        // method apart from an endpoint that is not an MCP endpoint at all.
        return rpcError(id, {
          status: 404,
          code: JSON_RPC_METHOD_NOT_FOUND,
          message: `Method not found: ${message.method}. This server implements server/discover, tools/list, tools/call, resources/list, resources/templates/list and resources/read.`
        });
    }
  }

  // Legacy era. `server/discover` is answered here too: it carries no state,
  // and answering a metadata-less probe is the fastest way for a dual-era
  // client to learn which versions this server speaks.
  switch (message.method) {
    case "server/discover":
      return rpcResult(id, {
        resultType: "complete",
        ...discoverResult(),
        _meta: {[META_SERVER_INFO]: SERVER_INFO}
      });
    case "initialize":
      return rpcResult(id, {
        protocolVersion: negotiateLegacyVersion(
          message.params?.protocolVersion
        ),
        capabilities: CAPABILITIES,
        serverInfo: SERVER_INFO,
        instructions: `${INSTRUCTIONS}\n\nProtocol versions supported by this server: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")} (latest: ${LATEST_PROTOCOL_VERSION}).`
      });
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {tools: WIRE_TOOLS});
    case "resources/list":
      return rpcResult(id, {resources: await listResources(ctx)});
    case "resources/templates/list":
      return rpcResult(id, {resourceTemplates: [BLOG_POST_TEMPLATE]});
    case "resources/read": {
      const result = await readResourceResult(message, ctx);
      return isFailure(result) ? rpcError(id, result) : rpcResult(id, result);
    }
    case "tools/call": {
      const result = await runTool(message, ctx);
      return isFailure(result)
        ? rpcError(id, result)
        : rpcResult(id, {
            content: result.content,
            ...(result.structuredContent === undefined
              ? {}
              : {structuredContent: result.structuredContent}),
            isError: result.isError === true
          });
    }
    default:
      // 200, not 404: a 4xx here would send a legacy client off to probe the
      // deprecated HTTP+SSE transport instead of reading the error.
      return rpcError(id, {
        status: 200,
        code: JSON_RPC_METHOD_NOT_FOUND,
        message: `Method not found: ${message.method}. This server implements initialize, ping, tools/list, tools/call, resources/list, resources/templates/list and resources/read. Protocol versions supported: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}.`
      });
  }
});

// This revision defines neither the standalone GET stream nor DELETE session
// termination, so both are refused rather than silently accepted.
mcp.all("*", c =>
  rpcError(
    undefined,
    {
      status: 405,
      code: JSON_RPC_METHOD_NOT_FOUND,
      message: `${c.req.method} is not supported on the MCP endpoint. This revision of Streamable HTTP defines POST only — there is no GET stream and no session to DELETE.`
    },
    {Allow: "POST, OPTIONS"}
  )
);
