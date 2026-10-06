import { env } from "cloudflare:test";
import { assert, describe, expect, it, onTestFinished, vi } from "vitest";
import { z } from "zod";

import { CONTACT_DAILY_PER_CLIENT } from "#worker/api/contact.ts";
import { buildDataset } from "#worker/api/dataset.ts";
import { API_VERSION } from "#worker/api/versioning.ts";
import { JsonObject } from "#utils/json.ts";
import { LATEST_PROTOCOL_VERSION } from "#worker/mcp/protocol.ts";
import { readResource, RESOURCE_ORIGIN } from "#worker/mcp/resources.ts";
import { MCP_TOOLS } from "#worker/mcp/tools.ts";
import {
  AGENTS_MD,
  DATASET_INPUT,
  fakeAssets,
  fetchWorker,
  LLMS_FULL_TXT,
  LLMS_TXT,
  POST_MARKDOWN,
  recordingEmail,
  type TestEnvOptions
} from "./fixtures";

const META = "io.modelcontextprotocol/protocolVersion";
const CAPS = "io.modelcontextprotocol/clientCapabilities";
const INFO = "io.modelcontextprotocol/clientInfo";
const SERVER_INFO = "io.modelcontextprotocol/serverInfo";

const POST_URI = `${RESOURCE_ORIGIN}/blog/coin-change-problem/index.md`;

const JsonRpcReply = z.object({
  jsonrpc: z.literal("2.0").optional(),
  id: z.union([z.number(), z.string()]).nullish(),
  result: z.unknown().optional(),
  error: z
    .object({ code: z.number(), message: z.string(), data: z.unknown().optional() })
    .optional()
});
type JsonRpcReply = z.infer<typeof JsonRpcReply>;

// The SDK leaves isError out of a successful result.
const ToolCallResult = z.object({
  isError: z.boolean().optional(),
  content: z.array(z.object({ text: z.string() })),
  structuredContent: z.unknown().optional()
});

/** Parses a JSON reply, or the last `data:` line of a legacy request's SSE stream. */
function parseReply(res: Response, text: string): JsonRpcReply {
  if (!text) return {};
  if (!res.headers.get("Content-Type")?.startsWith("text/event-stream")) {
    return JsonRpcReply.parse(JSON.parse(text));
  }
  const data = text
    .split("\n")
    .filter(line => line.startsWith("data: "))
    .at(-1);
  assert(data, `no data line in the event stream: ${text}`);
  return JsonRpcReply.parse(JSON.parse(data.slice("data: ".length)));
}

async function send(
  body: unknown,
  init: {
    headers?: Record<string, string>;
    ip?: string;
    method?: string;
    env?: TestEnvOptions;
  } = {}
): Promise<{ res: Response; json: JsonRpcReply }> {
  const res = await fetchWorker("/mcp", {
    method: init.method ?? "POST",
    ip: init.ip ?? "203.0.113.70",
    env: init.env,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...init.headers
    },
    body:
      init.method && init.method !== "POST"
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body)
  });
  return { res, json: parseReply(res, await res.text()) };
}

function resultOf<S extends z.ZodType>({ json }: { json: JsonRpcReply }, schema: S): z.infer<S> {
  assert(json.result, `no result: ${JSON.stringify(json.error)}`);
  return schema.parse(json.result);
}

/** A spec-conformant modern request: `_meta` in the body, mirrored in headers. */
function modern(
  method: string,
  params: Record<string, unknown> = {},
  overrides: { version?: string } = {}
) {
  const version = overrides.version ?? LATEST_PROTOCOL_VERSION;
  const name = params.name ?? params.uri;
  const headers: Record<string, string> = {
    "MCP-Protocol-Version": version,
    "Mcp-Method": method,
    ...(typeof name === "string" ? { "Mcp-Name": name } : {})
  };
  const _meta: Record<string, unknown> = {
    [META]: version,
    [INFO]: { name: "TestClient", version: "1.0.0" },
    [CAPS]: {}
  };
  return {
    body: {
      jsonrpc: "2.0" as const,
      id: 1,
      method,
      params: { ...params, _meta }
    },
    headers
  };
}

async function callModern(
  method: string,
  params: Record<string, unknown> = {},
  init: { ip?: string; env?: TestEnvOptions } = {}
) {
  const { body, headers } = modern(method, params);
  return send(body, { headers, ...init });
}

function legacy(method: string, params: Record<string, unknown> = {}) {
  return send({ jsonrpc: "2.0", id: 1, method, params });
}

const ListedTools = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      title: z.string(),
      description: z.string(),
      inputSchema: JsonObject,
      outputSchema: JsonObject
    })
  )
});

/** The tools as a client sees them, JSON Schemas included. */
async function listedTools() {
  return resultOf(await callModern("tools/list"), ListedTools).tools;
}

/** Calls a tool over HTTP, so the SDK's input and output schema checks run too. */
async function call(
  name: string,
  args: Record<string, unknown> = {},
  { ip, ...options }: TestEnvOptions & { ip?: string } = {}
) {
  const reply = await callModern("tools/call", { name, arguments: args }, { ip, env: options });
  return resultOf(reply, ToolCallResult);
}

const resourceCtx = (overrides: Record<string, string | null> = {}) => ({
  assets: fakeAssets(overrides)
});

const ResourceList = z.object({
  resources: z.array(
    z.object({
      uri: z.string(),
      name: z.string(),
      title: z.string(),
      description: z.string(),
      mimeType: z.string(),
      annotations: z.object({ audience: z.array(z.string()), priority: z.number() })
    })
  )
});

function hasRef(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasRef);
  if (typeof node === "object" && node !== null)
    return Object.entries(node).some(([k, v]) => k === "$ref" || hasRef(v));
  return false;
}

describe("the MCP endpoint", () => {
  it.each(["GET", "DELETE"])(
    "answers 405 to %s: this revision has no stream and no sessions",
    async method => {
      const { res, json } = await send(null, { method });
      expect(res.status).toBe(405);
      expect(json).toEqual({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32000, message: "Method not allowed." }
      });
    }
  );

  it("answers a CORS preflight so browser clients can connect", async () => {
    const res = await fetchWorker("/mcp", {
      method: "OPTIONS",
      headers: {
        Origin: "https://agent.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "mcp-protocol-version"
      }
    });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toContain(
      "mcp-protocol-version"
    );
  });

  it("never mints or echoes a session id", async () => {
    const { body, headers } = modern("server/discover");
    const { res } = await send(body, {
      headers: { ...headers, "Mcp-Session-Id": "abc123" }
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Mcp-Session-Id")).toBeNull();
  });

  it.each([
    ["rejects an opaque Origin", "null", 403],
    ["accepts a normal cross-origin web client", "https://agent.example", 200]
  ])("%s", async (_label, origin, status) => {
    const { body, headers } = modern("server/discover");
    const { res } = await send(body, { headers: { ...headers, Origin: origin } });
    expect(res.status).toBe(status);
  });

  it("rejects a body that is not JSON with a parse error", async () => {
    const { res, json } = await send("{not json", {
      headers: {
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        "Mcp-Method": "tools/list"
      }
    });
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32700);
  });

  it("rejects a JSON-RPC batch, which the transport does not allow", async () => {
    const { body, headers } = modern("tools/list");
    const { res, json } = await send([body], { headers });
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32600);
  });

  const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
  const listTools = modern("tools/list");
  it.each<{ label: string; body: unknown; headers: Record<string, string>; status: number }>([
    {
      label: "a legacy body not labelled application/json",
      body: ping,
      headers: { "Content-Type": "text/plain" },
      status: 415
    },
    {
      label: "a modern body not labelled application/json",
      body: listTools.body,
      headers: { ...listTools.headers, "Content-Type": "text/plain" },
      status: 415
    },
    {
      label: "a legacy client that cannot take an event stream",
      body: ping,
      headers: { Accept: "application/json" },
      status: 406
    }
  ])("refuses $label", async ({ body, headers, status }) => {
    const { res, json } = await send(body, { headers });
    expect(res.status).toBe(status);
    expect(json.error?.code).toBe(-32000);
  });

  it("answers 202 with no body to a notification", async () => {
    const { res } = await send(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { headers: { "Mcp-Method": "notifications/initialized" } }
    );
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });
});

describe("modern request validation", () => {
  const getProfile = { name: "get_profile", arguments: {} };
  const readLlms = { uri: `${RESOURCE_ORIGIN}/llms.txt` };

  // undefined deletes the header.
  it.each<{
    label: string;
    method: string;
    params: Record<string, unknown>;
    edits: Record<string, string | undefined>;
  }>([
    {
      label: "a missing MCP-Protocol-Version",
      method: "tools/list",
      params: {},
      edits: { "MCP-Protocol-Version": undefined }
    },
    {
      label: "a version header that disagrees",
      method: "tools/list",
      params: {},
      edits: { "MCP-Protocol-Version": "2025-11-25" }
    },
    {
      label: "a missing Mcp-Method",
      method: "tools/list",
      params: {},
      edits: { "Mcp-Method": undefined }
    },
    {
      label: "an Mcp-Method that disagrees",
      method: "tools/list",
      params: {},
      edits: { "Mcp-Method": "tools/call" }
    },
    {
      label: "tools/call without Mcp-Name",
      method: "tools/call",
      params: getProfile,
      edits: { "Mcp-Name": undefined }
    },
    {
      label: "an Mcp-Name that disagrees with the tool",
      method: "tools/call",
      params: getProfile,
      edits: { "Mcp-Name": "x" }
    },
    {
      label: "an Mcp-Name that disagrees with the uri",
      method: "resources/read",
      params: readLlms,
      edits: { "Mcp-Name": `${RESOURCE_ORIGIN}/AGENTS.md` }
    }
  ])("rejects $label with HeaderMismatch", async ({ method, params, edits }) => {
    const { body, headers } = modern(method, params);
    for (const [key, value] of Object.entries(edits)) {
      if (value === undefined) delete headers[key];
      else headers[key] = value;
    }
    const { res, json } = await send(body, { headers });
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32020);
  });

  it("decodes a base64-sentinel Mcp-Name before comparing it", async () => {
    const { body, headers } = modern("tools/call", getProfile);
    const { res, json } = await send(body, {
      headers: { ...headers, "Mcp-Name": `=?base64?${btoa("get_profile")}?=` }
    });
    expect(res.status).toBe(200);
    expect(json.error).toBeUndefined();
  });

  it("rejects a request whose _meta omits clientCapabilities", async () => {
    const { body, headers } = modern("tools/list");
    delete body.params._meta[CAPS];
    const { res, json } = await send(body, { headers });
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32602);
  });

  it("rejects an unsupported protocol version and lists what it supports", async () => {
    const { body, headers } = modern("tools/list", {}, { version: "1900-01-01" });
    const { res, json } = await send(body, { headers });
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32022);
    expect(json.error?.data).toEqual({ supported: ["2026-07-28"], requested: "1900-01-01" });
  });

  it("rejects a legacy version sent as modern per-request metadata", async () => {
    const { body, headers } = modern("tools/list", {}, { version: "2025-11-25" });
    const { res, json } = await send(body, { headers });
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32022);
  });

  it("answers 404 with -32601 for an unknown method", async () => {
    const { res, json } = await callModern("does/not/exist");
    expect(res.status).toBe(404);
    expect(json.error?.code).toBe(-32601);
  });
});

describe("server/discover", () => {
  it("reports supported versions, capabilities, identity and instructions", async () => {
    const reply = await callModern("server/discover");
    expect(reply.res.headers.get("Content-Type")).toMatch(/^application\/json/);
    const result = resultOf(reply, JsonObject);
    expect(result.resultType).toBe("complete");
    expect(result.supportedVersions).toEqual(["2026-07-28"]);
    expect(result.capabilities).toEqual({
      tools: { listChanged: false },
      resources: { listChanged: false }
    });
    expect(result.cacheScope).toBe("public");
    expect(result).toHaveProperty(["_meta", SERVER_INFO], {
      name: "murugappan.dev",
      version: API_VERSION
    });
    expect(result.instructions).toMatch(/\S/);
  });
});

describe("tools over HTTP", () => {
  it("lists every tool with our schemas as a cacheable complete result", async () => {
    const result = resultOf(
      await callModern("tools/list"),
      ListedTools.extend({ resultType: z.string(), cacheScope: z.string() })
    );
    expect(result.resultType).toBe("complete");
    expect(result.cacheScope).toBe("public");
    expect(result.tools.map(t => t.name)).toEqual(MCP_TOOLS.map(t => t.name));
    const byName = new Map(result.tools.map(t => [t.name, t]));
    expect(byName.get("get_profile")?.inputSchema).toEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {},
      additionalProperties: false
    });
    expect(byName.get("get_blog_post")?.outputSchema).toMatchObject({
      type: "object",
      required: ["slug", "title", "url", "description", "markdown"],
      additionalProperties: false
    });
  });

  it("reports an unknown tool as a protocol error", async () => {
    const { res, json } = await callModern("tools/call", { name: "no_such_tool", arguments: {} });
    expect(res.status).toBe(200);
    expect(json.error?.code).toBe(-32602);
    expect(json.error?.message).toMatch(/no_such_tool/);
  });

  it("passes arguments through and reports a recoverable failure as isError", async () => {
    const reply = await callModern("tools/call", {
      name: "get_blog_post",
      arguments: { slug: "nope" }
    });
    expect(reply.json.error).toBeUndefined();
    const result = resultOf(reply, ToolCallResult);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("search_blog_posts");
  });

  it.each([
    ["a call with no tool name", { arguments: {} }],
    ["non-object arguments", { name: "get_profile", arguments: "nope" }]
  ])("rejects %s as invalid params", async (_label, params) => {
    const { body, headers } = modern("tools/call", params);
    const { res, json } = await send(body, { headers });
    expect(res.status).toBe(200);
    expect(json.error?.code).toBe(-32602);
  });

  // Keyed on CF-Connecting-IP, so this also guards the transport's IP wiring.
  it("spends the per-client contact allowance shared with the REST endpoint", async () => {
    const args = {
      name: "send_message",
      arguments: {
        email: "ada@example.com",
        message: "A perfectly valid message body for the allowance test."
      }
    };
    for (let i = 0; i < CONTACT_DAILY_PER_CLIENT; i++) {
      const reply = await callModern("tools/call", args, { ip: "198.51.100.81" });
      expect(resultOf(reply, ToolCallResult).structuredContent).toHaveProperty(
        "status",
        "accepted"
      );
    }
    const result = resultOf(
      await callModern("tools/call", args, { ip: "198.51.100.81" }),
      ToolCallResult
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/allowance|limit/i);
  });
});

describe("resources over HTTP", () => {
  it("lists the blog post URI template", async () => {
    const result = resultOf(
      await callModern("resources/templates/list"),
      z.object({ resourceTemplates: z.array(z.object({ uriTemplate: z.string() })) })
    );
    expect(result.resourceTemplates[0].uriTemplate).toBe(`${RESOURCE_ORIGIN}/blog/{slug}/index.md`);
  });

  it("reads a resource", async () => {
    const uri = `${RESOURCE_ORIGIN}/llms.txt`;
    const reply = await callModern("resources/read", { uri });
    expect(reply.res.status).toBe(200);
    const result = resultOf(
      reply,
      z.object({ resultType: z.string(), contents: z.array(JsonObject) })
    );
    expect(result.resultType).toBe("complete");
    expect(result.contents).toEqual([{ uri, mimeType: "text/plain", text: LLMS_TXT }]);
  });

  it("returns -32602 with the uri for a resource that does not exist", async () => {
    const uri = `${RESOURCE_ORIGIN}/nope`;
    const { res, json } = await callModern("resources/read", { uri });
    expect(res.status).toBe(200);
    expect(json.result).toBeUndefined();
    expect(json.error?.code).toBe(-32602);
    expect(json.error?.data).toEqual({ uri });
  });
});

describe("legacy (initialize-based) clients", () => {
  it("answers initialize with a negotiated legacy version and capabilities", async () => {
    const reply = await legacy("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "LegacyClient", version: "0.1.0" }
    });
    expect(reply.res.status).toBe(200);
    expect(reply.res.headers.get("Content-Type")).toBe("text/event-stream");
    const result = resultOf(
      reply,
      z.looseObject({
        protocolVersion: z.string(),
        capabilities: JsonObject,
        serverInfo: z.object({ name: z.string() }),
        instructions: z.string()
      })
    );
    expect(result.protocolVersion).toBe("2025-06-18");
    expect(result.capabilities).toEqual({
      tools: { listChanged: false },
      resources: { listChanged: false }
    });
    expect(result.serverInfo.name).toBe("murugappan.dev");
    expect(result.instructions).toMatch(/\S/);
    expect(result).not.toHaveProperty("resultType");
  });

  it("falls back to its newest legacy version for an unknown request", async () => {
    const reply = await legacy("initialize", {
      protocolVersion: "1999-01-01",
      capabilities: {},
      clientInfo: { name: "LegacyClient", version: "0.1.0" }
    });
    expect(resultOf(reply, z.object({ protocolVersion: z.string() })).protocolVersion).toBe(
      "2025-11-25"
    );
  });

  it("answers ping", async () => {
    const { json } = await legacy("ping");
    expect(json).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
  });

  it("lists and calls tools without the modern headers", async () => {
    const list = await legacy("tools/list");
    expect(list.res.status).toBe(200);
    expect(resultOf(list, z.object({ tools: z.array(z.unknown()) })).tools).toHaveLength(
      MCP_TOOLS.length
    );
    expect(list.json.result).not.toHaveProperty("resultType");

    const called = await legacy("tools/call", {
      name: "list_skills",
      arguments: {}
    });
    expect(resultOf(called, ToolCallResult).structuredContent).toHaveProperty("proficiencies", [
      { area: "Backend", tools: ["Node.js"], level: 90 }
    ]);
  });

  it.each([
    ["a call with no tool name", { arguments: {} }],
    ["an unknown tool", { name: "nope", arguments: {} }]
  ])("rejects %s as invalid params", async (_label, params) => {
    const { json } = await legacy("tools/call", params);
    expect(json.error?.code).toBe(-32602);
  });

  it("lists and reads resources without the modern headers", async () => {
    const list = await legacy("resources/list");
    expect(resultOf(list, z.object({ resources: z.array(z.unknown()) })).resources).toContainEqual(
      expect.objectContaining({ uri: POST_URI })
    );
    expect(list.json.result).not.toHaveProperty("resultType");

    const read = await legacy("resources/read", {
      uri: `${RESOURCE_ORIGIN}/AGENTS.md`
    });
    const { contents } = resultOf(
      read,
      z.object({ contents: z.array(z.object({ text: z.string() })) })
    );
    expect(contents[0].text).toBe(AGENTS_MD);
  });

  it("answers an unknown legacy method with 200 and -32601, not 404", async () => {
    const { res, json } = await legacy("prompts/list");
    expect(res.status).toBe(200);
    expect(json.error?.code).toBe(-32601);
  });
});

describe("MCP_TOOLS definitions", () => {
  it("uses names within the character set and length the spec allows", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.name, tool.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
    }
  });

  it("documents every tool and every input property", async () => {
    for (const tool of await listedTools()) {
      expect(tool.title, tool.name).toMatch(/\S/);
      expect(tool.description.length, tool.name).toBeGreaterThan(60);
      const props = z
        .record(z.string(), z.object({ description: z.string().optional() }))
        .parse(tool.inputSchema.properties ?? {});
      for (const [name, schema] of Object.entries(props)) {
        expect(schema.description, `${tool.name}.${name}`).toMatch(/\S/);
      }
    }
  });

  it("lists self-contained schemas with an object output", async () => {
    for (const tool of await listedTools()) {
      expect(tool.outputSchema.type, tool.name).toBe("object");
      expect(hasRef(tool.inputSchema), tool.name).toBe(false);
      expect(hasRef(tool.outputSchema), tool.name).toBe(false);
    }
  });

  it("marks the read tools read-only and the write tool not", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.annotations.readOnlyHint, tool.name).toBe(tool.name !== "send_message");
      expect(tool.annotations.destructiveHint, tool.name).toBe(false);
    }
  });
});

describe("dataset tools", () => {
  const dataset = buildDataset(DATASET_INPUT);

  it.each<[string, Array<keyof typeof dataset>]>([
    ["get_profile", ["person", "links"]],
    ["list_experience", ["experience"]],
    ["list_skills", ["skills", "proficiencies"]],
    ["list_education", ["education"]],
    ["list_open_source", ["openSource"]]
  ])("%s returns its slice of the dataset", async (name, keys) => {
    const result = await call(name);
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(Object.fromEntries(keys.map(k => [k, dataset[k]])));
    // The spec asks for the serialized JSON in a text block too.
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
  });

  it("reports a missing dataset as a tool execution error, not a throw", async () => {
    const result = await call("get_profile", {}, { assets: { "/api/dataset.json": null } });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not available/i);
  });
});

describe("search_blog_posts", () => {
  const search = async (args: Record<string, unknown>) =>
    (await call("search_blog_posts", args)).structuredContent;

  it("lists every post by default and applies limit", async () => {
    expect(await search({})).toHaveProperty("count", 2);
    expect(await search({ limit: 1 })).toHaveProperty("count", 1);
  });

  it("filters case-insensitively", async () => {
    expect(await search({ query: "RATE LIMITING" })).toHaveProperty("posts", [
      expect.objectContaining({ slug: "cloud-agnostic-rate-limiting" })
    ]);
    expect(await search({ query: "kubernetes" })).toHaveProperty("count", 0);
  });
});

describe("get_blog_post", () => {
  it("returns the post markdown", async () => {
    const { structuredContent } = await call("get_blog_post", { slug: "coin-change-problem" });
    expect(structuredContent).toHaveProperty("title", "Coin Change Problem");
    expect(structuredContent).toHaveProperty("markdown", POST_MARKDOWN);
  });
});

describe("send_message", () => {
  const message = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    message: "We are hiring a senior backend engineer for a data platform."
  };

  it("sends the message and confirms acceptance", async () => {
    const { email, sent } = recordingEmail();
    const result = await call("send_message", message, { ip: "198.51.100.60", email });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toHaveProperty("status", "accepted");
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("Ada Lovelace");
  });

  it("validates without sending when dryRun is set", async () => {
    const { email, sent } = recordingEmail();
    const result = await call(
      "send_message",
      { ...message, dryRun: true },
      { ip: "198.51.100.61", email }
    );
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toHaveProperty("status", "validated");
    expect(sent).toEqual([]);
  });

  it("reports every invalid field, with the contact endpoint's rules, in one result", async () => {
    const result = await call(
      "send_message",
      { email: "a@b", message: " ".repeat(25) },
      { ip: "198.51.100.62" }
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      "Input validation error: Invalid arguments for tool send_message: email: must be a valid email address, message: must be between 20 and 4000 characters"
    );
  });

  it("rejects an argument the tool does not take", async () => {
    const { email, sent } = recordingEmail();
    const result = await call(
      "send_message",
      { ...message, subject: "Hello" },
      { ip: "198.51.100.63", email }
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      'Input validation error: Invalid arguments for tool send_message: Unrecognized key: "subject"'
    );
    expect(sent).toEqual([]);
  });

  it.each<[string, TestEnvOptions & { ip: string }]>([
    ["an unconfigured inbox", { ip: "198.51.100.64", inbox: "" }],
    [
      "a failed delivery",
      { ip: "198.51.100.65", email: { send: () => Promise.reject(new Error("relay down")) } }
    ]
  ])("reports %s as a tool execution error", async (_label, options) => {
    expect((await call("send_message", message, options)).isError).toBe(true);
  });

  it("logs a rate limiter failure and reports it as a tool execution error", async () => {
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    const failure = new Error("limiter down");
    const limiter = env.RateLimiter.get(env.RateLimiter.idFromName("global"));
    vi.spyOn(limiter, "takeContactSlot").mockRejectedValue(failure);
    vi.spyOn(env.RateLimiter, "get").mockReturnValue(limiter);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await call("send_message", message, { ip: "198.51.100.66" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("could not be delivered");
    expect(logged).toHaveBeenCalledWith("mcp send_message failed", failure);
  });
});

describe("resources/list", () => {
  const STATIC_URIS = [
    `${RESOURCE_ORIGIN}/llms.txt`,
    `${RESOURCE_ORIGIN}/AGENTS.md`,
    `${RESOURCE_ORIGIN}/openapi.json`,
    `${RESOURCE_ORIGIN}/blog/llms-full.txt`
  ];
  const list = async (envOptions?: TestEnvOptions) =>
    resultOf(await callModern("resources/list", {}, { env: envOptions }), ResourceList).resources;

  it("lists the site's documents and every blog post as a cacheable complete result", async () => {
    const reply = await callModern("resources/list");
    expect(reply.json.result).toMatchObject({ resultType: "complete", cacheScope: "public" });
    expect(resultOf(reply, ResourceList).resources.map(r => r.uri)).toEqual([
      ...STATIC_URIS,
      `${RESOURCE_ORIGIN}/blog/cloud-agnostic-rate-limiting/index.md`,
      POST_URI
    ]);
  });

  // oxlint-disable-next-line tests/observe-behaviour -- a relation across rows: the summary outranks a post
  it("prioritises the site summary over a single post", async () => {
    const priority = new Map((await list()).map(r => [r.uri, r.annotations.priority]));
    const summaryPriority = priority.get(`${RESOURCE_ORIGIN}/llms.txt`);
    const postPriority = priority.get(POST_URI);
    assert(summaryPriority !== undefined && postPriority !== undefined, "a priority is missing");
    expect(summaryPriority).toBeGreaterThan(postPriority);
  });

  it("uses each post's title and summary from the site's own post list", async () => {
    const post = (await list()).find(r => r.uri.includes("cloud-agnostic-rate-limiting"));
    assert(post, "the rate-limiting post is not listed");
    expect(post.title).toBe("Modern distributed rate limiting in the cloud");
    expect(post.description).toContain("per-user rate limiting");
    expect(post.mimeType).toBe("text/markdown");
  });

  it("still lists the static documents when the post list is unavailable", async () => {
    const uris = (await list({ assets: { "/llms.txt": null } })).map(r => r.uri);
    expect(uris).toEqual(STATIC_URIS);
  });
});

describe("readResource", () => {
  const contents = ({ path, mimeType, text }: { path: string; mimeType: string; text: string }) => [
    { uri: `${RESOURCE_ORIGIN}${path}`, mimeType, text }
  ];

  // null becomes a -32602 on the wire, never an empty contents array.
  it.each<{
    label: string;
    uri: string;
    overrides?: Record<string, string | null>;
    expected: ReturnType<typeof contents> | null;
  }>([
    {
      label: "reads a static document",
      uri: `${RESOURCE_ORIGIN}/AGENTS.md`,
      expected: contents({ path: "/AGENTS.md", mimeType: "text/markdown", text: AGENTS_MD })
    },
    {
      label: "reads the full-text blog dump",
      uri: `${RESOURCE_ORIGIN}/blog/llms-full.txt`,
      expected: contents({
        path: "/blog/llms-full.txt",
        mimeType: "text/plain",
        text: LLMS_FULL_TXT
      })
    },
    {
      label: "reads a published post",
      uri: POST_URI,
      expected: contents({
        path: "/blog/coin-change-problem/index.md",
        mimeType: "text/markdown",
        text: POST_MARKDOWN
      })
    },
    {
      label: "returns null for an unpublished post, even one whose markdown is deployed",
      uri: `${RESOURCE_ORIGIN}/blog/ghost/index.md`,
      overrides: { "/blog/ghost/index.md": "# Ghost" },
      expected: null
    },
    {
      label: "returns null for a listed post whose markdown is missing",
      uri: `${RESOURCE_ORIGIN}/blog/cloud-agnostic-rate-limiting/index.md`,
      expected: null
    },
    {
      label: "returns null for an unknown path",
      uri: `${RESOURCE_ORIGIN}/secrets`,
      expected: null
    },
    { label: "returns null for a string that is not a uri", uri: "not a uri", expected: null },
    {
      label: "returns null for a traversal in the slug",
      uri: `${RESOURCE_ORIGIN}/blog/../../llms.txt/index.md`,
      expected: null
    },
    {
      label: "returns null for an encoded traversal in the slug",
      uri: `${RESOURCE_ORIGIN}/blog/..%2F..%2Fllms.txt/index.md`,
      expected: null
    },
    {
      label: "returns null for a slug outside the slug charset",
      uri: `${RESOURCE_ORIGIN}/blog/Mixed_Case/index.md`,
      expected: null
    },
    {
      label: "returns null for a document on another origin",
      uri: "https://evil.example/llms.txt",
      expected: null
    },
    {
      label: "returns null for a post on another origin",
      uri: "https://evil.example/blog/coin-change-problem/index.md",
      expected: null
    },
    {
      label: "returns null for a static document that is not deployed",
      uri: `${RESOURCE_ORIGIN}/llms.txt`,
      overrides: { "/llms.txt": null },
      expected: null
    }
  ])("$label", async ({ uri, overrides, expected }) => {
    expect(await readResource(uri, resourceCtx(overrides))).toEqual(expected);
  });

  it("generates the OpenAPI document rather than reading a file", async () => {
    const contents = await readResource(`${RESOURCE_ORIGIN}/openapi.json`, resourceCtx());
    const [content] = contents ?? [];
    assert(content, "openapi.json returned no contents");
    expect(content.mimeType).toBe("application/json");
    const doc = z
      .object({ openapi: z.string(), servers: z.array(z.object({ url: z.string() })) })
      .parse(JSON.parse(content.text));
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers[0].url).toBe(RESOURCE_ORIGIN);
  });
});
