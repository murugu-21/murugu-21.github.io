import { assert, describe, expect, it } from "vitest";
import { z } from "zod";

import { CONTACT_DAILY_PER_CLIENT } from "../api/contact";
import { buildDataset } from "../api/dataset";
import { buildOpenApiDocument } from "../api/openapi";
import {
  LATEST_PROTOCOL_VERSION,
  LEGACY_PROTOCOL_VERSIONS,
  SUPPORTED_PROTOCOL_VERSIONS
} from "../mcp/protocol";
import { listResources, readResource, RESOURCE_ORIGIN } from "../mcp/resources";
import { inlineRefs, resolveSchema } from "../mcp/schema";
import { MCP_TOOLS, findTool } from "../mcp/tools";
import {
  AGENTS_MD,
  DATASET_INPUT,
  fakeAssets,
  fetchWorker,
  LLMS_FULL_TXT,
  LLMS_TXT,
  POST_MARKDOWN,
  recordingEmail,
  testEnv,
  type TestEnvOptions
} from "./fixtures";

const META = "io.modelcontextprotocol/protocolVersion";
const CAPS = "io.modelcontextprotocol/clientCapabilities";
const INFO = "io.modelcontextprotocol/clientInfo";
const SERVER_INFO = "io.modelcontextprotocol/serverInfo";

const POST_URI = `${RESOURCE_ORIGIN}/blog/coin-change-problem/index.md`;

type JsonRpc<R> = {
  jsonrpc?: "2.0";
  id?: number | string;
  result?: R;
  error?: { code: number; message: string; data?: unknown };
};

type AnyResult = Record<string, unknown>;
type ToolCallResult = { isError: boolean; content: Array<{ text: string }> };

async function send<R = AnyResult>(
  body: unknown,
  init: {
    headers?: Record<string, string>;
    ip?: string;
    method?: string;
  } = {}
): Promise<{ res: Response; json: JsonRpc<R> }> {
  const res = await fetchWorker("/mcp", {
    method: init.method ?? "POST",
    ip: init.ip ?? "203.0.113.70",
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
  const text = await res.text();
  const json: JsonRpc<R> = text ? JSON.parse(text) : {};
  return { res, json };
}

function resultOf<R>({ json }: { json: JsonRpc<R> }): R {
  assert(json.result, `no result: ${JSON.stringify(json.error)}`);
  return json.result;
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

async function callModern<R = AnyResult>(
  method: string,
  params: Record<string, unknown> = {},
  init: { ip?: string } = {}
) {
  const { body, headers } = modern(method, params);
  return send<R>(body, { headers, ...init });
}

function legacy<R = AnyResult>(method: string, params: Record<string, unknown> = {}) {
  return send<R>({ jsonrpc: "2.0", id: 1, method, params });
}

/** Runs a tool directly, without the transport. */
async function call(
  name: string,
  args: Record<string, unknown> = {},
  options: TestEnvOptions & { ip?: string } = {}
) {
  const tool = findTool(name);
  if (!tool) throw new Error(`no such tool: ${name}`);
  const env = testEnv(options);
  return tool.run(args, { assets: env.ASSETS, env, clientIp: options.ip ?? "203.0.113.50" });
}

const resourceCtx = (overrides: Record<string, string | null> = {}) => ({
  assets: fakeAssets(overrides)
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
      const { res } = await send(null, { method });
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
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
    { label: "a nameless tools/call", method: "tools/call", params: { arguments: {} }, edits: {} },
    {
      label: "an Mcp-Name that disagrees with the uri",
      method: "resources/read",
      params: readLlms,
      edits: { "Mcp-Name": `${RESOURCE_ORIGIN}/AGENTS.md` }
    },
    {
      label: "a uri-less resources/read",
      method: "resources/read",
      params: {},
      edits: { "Mcp-Name": "anything" }
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
    expect(json.error?.data).toEqual({
      supported: SUPPORTED_PROTOCOL_VERSIONS,
      requested: "1900-01-01"
    });
  });

  it("rejects a legacy version sent as modern per-request metadata", async () => {
    const { body, headers } = modern("tools/list", {}, { version: LEGACY_PROTOCOL_VERSIONS[0] });
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
    const result = resultOf(reply);
    expect(result.resultType).toBe("complete");
    expect(result.supportedVersions).toEqual(SUPPORTED_PROTOCOL_VERSIONS);
    expect(result.capabilities).toEqual({ tools: {}, resources: {} });
    expect(result).toHaveProperty(["_meta", SERVER_INFO], {
      name: "murugappan.dev",
      version: expect.any(String)
    });
    expect(result.instructions).toBeTruthy();
  });

  it("answers even without per-request metadata, so a client can probe", async () => {
    const { res, json } = await send(
      { jsonrpc: "2.0", id: 9, method: "server/discover" },
      { headers: { "Mcp-Method": "server/discover" } }
    );
    expect(res.status).toBe(200);
    expect(json.result?.supportedVersions).toEqual(SUPPORTED_PROTOCOL_VERSIONS);
  });
});

describe("tools over HTTP", () => {
  it("lists every tool as a cacheable complete result", async () => {
    const result = resultOf(
      await callModern<{
        resultType: string;
        tools: Array<{ name: string; outputSchema: object }>;
        cacheScope: string;
      }>("tools/list")
    );
    expect(result.resultType).toBe("complete");
    expect(result.cacheScope).toBe("public");
    expect(result.tools.map(t => t.name)).toEqual(MCP_TOOLS.map(t => t.name));
    expect(result.tools.every(t => t.outputSchema)).toBe(true);
  });

  it("runs a read tool and returns structured content", async () => {
    const result = resultOf(
      await callModern<{
        resultType: string;
        isError: boolean;
        structuredContent: { person: { name: string } };
        content: Array<{ type: string }>;
      }>("tools/call", { name: "get_profile", arguments: {} })
    );
    expect(result.resultType).toBe("complete");
    expect(result.isError).toBe(false);
    expect(result.structuredContent.person.name).toBe("Murugappan M");
    expect(result.content[0].type).toBe("text");
  });

  it("reports an unknown tool as a protocol error", async () => {
    const { res, json } = await callModern("tools/call", { name: "no_such_tool", arguments: {} });
    expect(res.status).toBe(200);
    expect(json.error?.code).toBe(-32602);
    expect(json.error?.message).toMatch(/no_such_tool/);
  });

  it("passes arguments through and reports a recoverable failure as isError", async () => {
    const reply = await callModern<ToolCallResult>("tools/call", {
      name: "get_blog_post",
      arguments: { slug: "nope" }
    });
    expect(reply.json.error).toBeUndefined();
    const result = resultOf(reply);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("search_blog_posts");
  });

  it("rejects non-object arguments as invalid params", async () => {
    const { json } = await callModern("tools/call", { name: "get_profile", arguments: "nope" });
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
      const reply = await callModern<ToolCallResult>("tools/call", args, { ip: "198.51.100.81" });
      expect(resultOf(reply).isError).toBe(false);
    }
    const result = resultOf(
      await callModern<ToolCallResult>("tools/call", args, { ip: "198.51.100.81" })
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/allowance|limit/i);
  });
});

describe("resources over HTTP", () => {
  it("lists the site's documents and every post", async () => {
    const result = resultOf(
      await callModern<{
        resultType: string;
        resources: Array<{ uri: string }>;
        cacheScope: string;
      }>("resources/list")
    );
    expect(result.resultType).toBe("complete");
    expect(result.cacheScope).toBe("public");
    expect(result.resources.map(r => r.uri)).toContain(POST_URI);
  });

  it("lists the blog post URI template", async () => {
    const result = resultOf(
      await callModern<{ resourceTemplates: Array<{ uriTemplate: string }> }>(
        "resources/templates/list"
      )
    );
    expect(result.resourceTemplates[0].uriTemplate).toBe(`${RESOURCE_ORIGIN}/blog/{slug}/index.md`);
  });

  it("reads a resource", async () => {
    const uri = `${RESOURCE_ORIGIN}/llms.txt`;
    const reply = await callModern<{
      resultType: string;
      contents: Array<{ uri: string; text: string }>;
    }>("resources/read", { uri });
    expect(reply.res.status).toBe(200);
    const result = resultOf(reply);
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
    const reply = await legacy<{
      protocolVersion: string;
      capabilities: object;
      serverInfo: { name: string };
      instructions: string;
    }>("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "LegacyClient", version: "0.1.0" }
    });
    expect(reply.res.status).toBe(200);
    const result = resultOf(reply);
    expect(result.protocolVersion).toBe("2025-06-18");
    expect(result.capabilities).toEqual({ tools: {}, resources: {} });
    expect(result.serverInfo.name).toBe("murugappan.dev");
    expect(result.instructions).toBeTruthy();
    expect(result).not.toHaveProperty("resultType");
  });

  it("falls back to its newest legacy version for an unknown request", async () => {
    const reply = await legacy<{ protocolVersion: string }>("initialize", {
      protocolVersion: "1999-01-01",
      capabilities: {}
    });
    expect(resultOf(reply).protocolVersion).toBe(LEGACY_PROTOCOL_VERSIONS[0]);
  });

  it("names the protocol versions it supports when it cannot serve initialize", async () => {
    const { json } = await legacy("initialize", { protocolVersion: 42 });
    const message = JSON.stringify(json);
    for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
      expect(message).toContain(version);
    }
  });

  it("answers ping", async () => {
    const { json } = await legacy("ping");
    expect(json.result).toEqual({});
  });

  it("lists and calls tools without the modern headers", async () => {
    const list = await legacy<{ tools: unknown[] }>("tools/list");
    expect(list.res.status).toBe(200);
    expect(resultOf(list).tools).toHaveLength(MCP_TOOLS.length);
    expect(list.json.result).not.toHaveProperty("resultType");

    const called = await legacy<ToolCallResult>("tools/call", {
      name: "list_skills",
      arguments: {}
    });
    expect(resultOf(called).isError).toBe(false);
  });

  it.each([
    ["a call with no tool name", { arguments: {} }],
    ["an unknown tool", { name: "nope", arguments: {} }]
  ])("rejects %s as invalid params", async (_label, params) => {
    const { json } = await legacy("tools/call", params);
    expect(json.error?.code).toBe(-32602);
  });

  it("lists and reads resources without the modern headers", async () => {
    const list = await legacy<{ resources: unknown[] }>("resources/list");
    expect(resultOf(list).resources).toContainEqual(expect.objectContaining({ uri: POST_URI }));
    expect(list.json.result).not.toHaveProperty("resultType");

    const read = await legacy<{ contents: Array<{ text: string }> }>("resources/read", {
      uri: `${RESOURCE_ORIGIN}/AGENTS.md`
    });
    const { contents } = resultOf(read);
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

  it("documents every tool and every input property", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.description.length, tool.name).toBeGreaterThan(60);
      const props = z
        .record(z.string(), z.object({ description: z.string().optional() }))
        .parse(tool.inputSchema.properties ?? {});
      for (const [name, schema] of Object.entries(props)) {
        expect(schema.description, `${tool.name}.${name}`).toBeTruthy();
      }
    }
  });

  it("declares self-contained object input and output schemas", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.inputSchema.type, tool.name).toBe("object");
      expect(tool.outputSchema?.type, tool.name).toBe("object");
      expect(hasRef(tool.inputSchema), tool.name).toBe(false);
      expect(hasRef(tool.outputSchema), tool.name).toBe(false);
    }
  });

  it("closes the schema of a tool that takes no arguments", () => {
    expect(findTool("get_profile")?.inputSchema).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false
    });
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
    expect(result.isError).toBeFalsy();
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

  it.each([
    ["an out-of-range limit", { limit: 0 }, /limit/],
    ["a non-string query", { query: 42 }, /query/]
  ])("rejects %s as a tool execution error", async (_label, args, field) => {
    const result = await call("search_blog_posts", args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(field);
  });
});

describe("get_blog_post", () => {
  it("returns the post markdown", async () => {
    const { structuredContent } = await call("get_blog_post", { slug: "coin-change-problem" });
    expect(structuredContent).toHaveProperty("title", "Coin Change Problem");
    expect(structuredContent).toHaveProperty("markdown", POST_MARKDOWN);
  });

  it("rejects a missing slug", async () => {
    const result = await call("get_blog_post", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/slug/);
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
    expect(result.isError).toBeFalsy();
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
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toHaveProperty("status", "validated");
    expect(sent).toEqual([]);
  });

  it("reports each invalid field so the model can self-correct", async () => {
    const result = await call(
      "send_message",
      { email: "nope", message: "hi" },
      { ip: "198.51.100.62" }
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("email");
    expect(result.content[0].text).toContain("message");
  });

  it.each<[string, TestEnvOptions & { ip: string }]>([
    ["an unconfigured inbox", { ip: "198.51.100.64", inbox: null }],
    [
      "a failed delivery",
      { ip: "198.51.100.65", email: { send: () => Promise.reject(new Error("relay down")) } }
    ]
  ])("reports %s as a tool execution error", async (_label, options) => {
    expect((await call("send_message", message, options)).isError).toBe(true);
  });
});

describe("listResources", () => {
  it("lists the site's machine-readable documents and every blog post", async () => {
    const uris = (await listResources(resourceCtx())).map(r => r.uri);
    expect(uris).toEqual([
      `${RESOURCE_ORIGIN}/llms.txt`,
      `${RESOURCE_ORIGIN}/AGENTS.md`,
      `${RESOURCE_ORIGIN}/openapi.json`,
      `${RESOURCE_ORIGIN}/blog/llms-full.txt`,
      `${RESOURCE_ORIGIN}/blog/cloud-agnostic-rate-limiting/index.md`,
      POST_URI
    ]);
  });

  it("describes and prioritises every resource for the assistant", async () => {
    const resources = await listResources(resourceCtx());
    for (const resource of resources) {
      expect(resource.name, resource.uri).toBeTruthy();
      expect(resource.title, resource.uri).toBeTruthy();
      expect(resource.description, resource.uri).toBeTruthy();
      expect(resource.mimeType, resource.uri).toBeTruthy();
      expect(resource.annotations?.audience, resource.uri).toContain("assistant");
      const priority = resource.annotations?.priority ?? -1;
      expect(priority, resource.uri).toBeGreaterThan(0);
      expect(priority, resource.uri).toBeLessThanOrEqual(1);
    }
    const priority = new Map(resources.map(r => [r.uri, r.annotations?.priority]));
    const postPriority = priority.get(POST_URI);
    assert(postPriority !== undefined, "the post has no priority");
    expect(priority.get(`${RESOURCE_ORIGIN}/llms.txt`)).toBeGreaterThan(postPriority);
  });

  it("uses each post's title and summary from the site's own post list", async () => {
    const post = (await listResources(resourceCtx())).find(r =>
      r.uri.includes("cloud-agnostic-rate-limiting")
    );
    assert(post, "the rate-limiting post is not listed");
    expect(post.title).toBe("Modern distributed rate limiting in the cloud");
    expect(post.description).toContain("per-user rate limiting");
  });

  it("still lists the static documents when the post list is unavailable", async () => {
    const uris = (await listResources(resourceCtx({ "/llms.txt": null }))).map(r => r.uri);
    expect(uris).toContain(`${RESOURCE_ORIGIN}/openapi.json`);
    expect(uris).not.toContain(POST_URI);
  });
});

describe("readResource", () => {
  it.each([
    ["/AGENTS.md", "text/markdown", AGENTS_MD],
    ["/blog/llms-full.txt", "text/plain", LLMS_FULL_TXT],
    ["/blog/coin-change-problem/index.md", "text/markdown", POST_MARKDOWN]
  ])("reads %s", async (path, mimeType, text) => {
    const uri = `${RESOURCE_ORIGIN}${path}`;
    expect(await readResource(uri, resourceCtx())).toEqual([{ uri, mimeType, text }]);
  });

  it("generates the OpenAPI document rather than reading a file", async () => {
    const contents = await readResource(`${RESOURCE_ORIGIN}/openapi.json`, resourceCtx());
    const [content] = contents ?? [];
    assert(content, "openapi.json returned no contents");
    expect(content.mimeType).toBe("application/json");
    const doc: { openapi: string; servers: Array<{ url: string }> } = JSON.parse(content.text);
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers[0].url).toBe(RESOURCE_ORIGIN);
  });

  // null becomes a -32602 on the wire, never an empty contents array.
  it.each<[string, string, Record<string, string | null>?]>([
    [
      "an unpublished post, even one whose markdown is deployed",
      `${RESOURCE_ORIGIN}/blog/ghost/index.md`,
      { "/blog/ghost/index.md": "# Ghost" }
    ],
    [
      "a listed post whose markdown is missing",
      `${RESOURCE_ORIGIN}/blog/cloud-agnostic-rate-limiting/index.md`
    ],
    ["an unknown path", `${RESOURCE_ORIGIN}/secrets`],
    ["a string that is not a uri", "not a uri"],
    ["a traversal in the slug", `${RESOURCE_ORIGIN}/blog/../../llms.txt/index.md`],
    ["an encoded traversal in the slug", `${RESOURCE_ORIGIN}/blog/..%2F..%2Fllms.txt/index.md`],
    ["a slug outside the slug charset", `${RESOURCE_ORIGIN}/blog/Mixed_Case/index.md`],
    ["a document on another origin", "https://evil.example/llms.txt"],
    ["a post on another origin", "https://evil.example/blog/coin-change-problem/index.md"],
    ["a static document that is not deployed", `${RESOURCE_ORIGIN}/llms.txt`, { "/llms.txt": null }]
  ])("returns null for %s", async (_label, uri, overrides) => {
    expect(await readResource(uri, resourceCtx(overrides))).toBeNull();
  });
});

describe("inlineRefs", () => {
  const fixture = {
    Wrapper: {
      type: "object",
      properties: {
        item: { $ref: "#/components/schemas/Item" },
        items: { type: "array", items: { $ref: "#/components/schemas/Item" } }
      }
    },
    Item: { type: "object", properties: { id: { type: "string" } } }
  };

  it("inlines refs at the root and nested in properties and array items", () => {
    expect(inlineRefs({ $ref: "#/components/schemas/Item" }, fixture)).toEqual(fixture.Item);
    const out = inlineRefs(fixture.Wrapper, fixture);
    expect(out).toHaveProperty("properties.item", fixture.Item);
    expect(out).toHaveProperty("properties.items.items", fixture.Item);
  });

  it("does not mutate the source schemas", () => {
    const before = JSON.stringify(fixture);
    inlineRefs(fixture.Wrapper, fixture);
    expect(JSON.stringify(fixture)).toBe(before);
  });

  it("keeps sibling keywords alongside a $ref", () => {
    const out = inlineRefs({ $ref: "#/components/schemas/Item", description: "one item" }, fixture);
    expect(out).toHaveProperty("description", "one item");
    expect(out).toHaveProperty("type", "object");
  });

  it("throws on a $ref that points nowhere", () => {
    expect(() => inlineRefs({ $ref: "#/components/schemas/Ghost" }, fixture)).toThrow(/Ghost/);
  });

  it("throws on an external $ref rather than dereferencing a network URI", () => {
    expect(() => inlineRefs({ $ref: "https://evil.example/schema.json" }, fixture)).toThrow(
      /external/i
    );
  });

  it("throws rather than looping forever on a cyclic $ref", () => {
    const cyclic = {
      A: { type: "object", properties: { b: { $ref: "#/components/schemas/A" } } }
    };
    expect(() => inlineRefs(cyclic.A, cyclic)).toThrow(/depth/i);
  });
});

describe("resolveSchema", () => {
  it("resolves every schema the API document declares", () => {
    const { schemas } = buildOpenApiDocument(RESOURCE_ORIGIN).components;
    for (const name of Object.keys(schemas)) {
      expect(hasRef(resolveSchema(name, schemas)), name).toBe(false);
    }
  });
});
