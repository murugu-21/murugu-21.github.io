import {env} from "cloudflare:test";
import {describe, expect, it} from "vitest";

import {CONTACT_DAILY_PER_CLIENT} from "../api/contact";
import {
  LATEST_PROTOCOL_VERSION,
  LEGACY_PROTOCOL_VERSIONS,
  SUPPORTED_PROTOCOL_VERSIONS
} from "../mcp/protocol";
import worker from "../server";
import {fakeAssets} from "./fixtures";

const META = "io.modelcontextprotocol/protocolVersion";
const CAPS = "io.modelcontextprotocol/clientCapabilities";
const INFO = "io.modelcontextprotocol/clientInfo";
const SERVER_INFO = "io.modelcontextprotocol/serverInfo";

type Options = {
  assets?: Record<string, string | null>;
  inbox?: string | null;
  email?: {send(msg: unknown): Promise<unknown>} | null;
};

function testEnv(options: Options = {}): Env {
  return {
    ...env,
    ASSETS: fakeAssets(options.assets),
    OPPORTUNITY_INBOX:
      options.inbox === undefined ? "inbox@example.com" : options.inbox,
    EMAIL:
      options.email === undefined
        ? {send: () => Promise.resolve()}
        : options.email
  } as unknown as Env;
}

type JsonRpc = {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: {code: number; message: string; data?: unknown};
};

async function send(
  body: unknown,
  init: {
    headers?: Record<string, string>;
    ip?: string;
    method?: string;
    options?: Options;
  } = {}
): Promise<{res: Response; json: JsonRpc}> {
  const res = await worker.fetch(
    new Request("https://murugappan.dev/mcp", {
      method: init.method ?? "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "CF-Connecting-IP": init.ip ?? "203.0.113.70",
        ...init.headers
      },
      body:
        init.method && init.method !== "POST"
          ? undefined
          : typeof body === "string"
            ? body
            : JSON.stringify(body)
    }),
    testEnv(init.options)
  );
  const text = await res.text();
  return {res, json: text ? (JSON.parse(text) as JsonRpc) : ({} as JsonRpc)};
}

/** A spec-conformant modern request: `_meta` in the body, mirrored in headers. */
function modern(
  method: string,
  params: Record<string, unknown> = {},
  overrides: {
    version?: string;
    id?: number;
    headers?: Record<string, string>;
  } = {}
) {
  const version = overrides.version ?? LATEST_PROTOCOL_VERSION;
  const name = params.name ?? params.uri;
  const headers: Record<string, string> = {
    "MCP-Protocol-Version": version,
    "Mcp-Method": method,
    ...(typeof name === "string" ? {"Mcp-Name": name} : {}),
    ...overrides.headers
  };
  return {
    body: {
      jsonrpc: "2.0" as const,
      id: overrides.id ?? 1,
      method,
      params: {
        ...params,
        _meta: {
          [META]: version,
          [INFO]: {name: "TestClient", version: "1.0.0"},
          [CAPS]: {}
        }
      }
    },
    headers
  };
}

async function callModern(
  method: string,
  params: Record<string, unknown> = {},
  init: {ip?: string; options?: Options} = {}
) {
  const {body, headers} = modern(method, params);
  return send(body, {headers, ...init});
}

describe("the MCP endpoint", () => {
  it("is claimed by the Worker, not served as a static asset", async () => {
    const {res} = await callModern("server/discover");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
  });

  it("answers 405 to GET, which this revision does not define", async () => {
    const {res} = await send(null, {method: "GET"});
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
  });

  it("answers 405 to DELETE, since there are no sessions to terminate", async () => {
    const {res} = await send(null, {method: "DELETE"});
    expect(res.status).toBe(405);
  });

  it("answers a CORS preflight so browser clients can connect", async () => {
    const res = await worker.fetch(
      new Request("https://murugappan.dev/mcp", {
        method: "OPTIONS",
        headers: {
          Origin: "https://agent.example",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "mcp-protocol-version"
        }
      }),
      testEnv()
    );
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(
      res.headers.get("Access-Control-Allow-Headers")?.toLowerCase()
    ).toContain("mcp-protocol-version");
  });

  it("never mints or echoes a session id", async () => {
    const {body, headers} = modern("server/discover");
    const {res} = await send(body, {
      headers: {...headers, "Mcp-Session-Id": "abc123"}
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Mcp-Session-Id")).toBeNull();
  });

  it("rejects an Origin that is not a web origin", async () => {
    const {body, headers} = modern("server/discover");
    const {res} = await send(body, {
      headers: {...headers, Origin: "null"}
    });
    expect(res.status).toBe(403);
  });

  it("accepts a normal cross-origin web client", async () => {
    const {body, headers} = modern("server/discover");
    const {res} = await send(body, {
      headers: {...headers, Origin: "https://agent.example"}
    });
    expect(res.status).toBe(200);
  });

  it("rejects a body that is not JSON with a parse error", async () => {
    const {res, json} = await send("{not json", {
      headers: {
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        "Mcp-Method": "tools/list"
      }
    });
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32700);
  });

  it("rejects a JSON-RPC batch, which the transport does not allow", async () => {
    const {body, headers} = modern("tools/list");
    const {res, json} = await send([body], {headers});
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32600);
  });

  it("answers 202 with no body to a notification", async () => {
    const {res} = await send(
      {jsonrpc: "2.0", method: "notifications/initialized"},
      {headers: {"Mcp-Method": "notifications/initialized"}}
    );
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });
});

describe("modern request validation", () => {
  it("rejects a missing MCP-Protocol-Version header with HeaderMismatch", async () => {
    const {body, headers} = modern("tools/list");
    delete headers["MCP-Protocol-Version"];
    const {res, json} = await send(body, {headers});
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32020);
    expect(json.error?.message).toMatch(/MCP-Protocol-Version/i);
  });

  it("rejects a protocol version header that disagrees with the body", async () => {
    const {body, headers} = modern("tools/list");
    const {res, json} = await send(body, {
      headers: {...headers, "MCP-Protocol-Version": "2025-11-25"}
    });
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32020);
  });

  it("rejects a missing Mcp-Method header", async () => {
    const {body, headers} = modern("tools/list");
    delete headers["Mcp-Method"];
    const {res, json} = await send(body, {headers});
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32020);
  });

  it("rejects an Mcp-Method header that disagrees with the body", async () => {
    const {body, headers} = modern("tools/list");
    const {res, json} = await send(body, {
      headers: {...headers, "Mcp-Method": "tools/call"}
    });
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32020);
  });

  it("requires Mcp-Name on tools/call", async () => {
    const {body, headers} = modern("tools/call", {
      name: "get_profile",
      arguments: {}
    });
    delete headers["Mcp-Name"];
    const {res, json} = await send(body, {headers});
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32020);
    expect(json.error?.message).toMatch(/Mcp-Name/i);
  });

  it("rejects an Mcp-Name that disagrees with params.name", async () => {
    const {body, headers} = modern("tools/call", {
      name: "get_profile",
      arguments: {}
    });
    const {res, json} = await send(body, {
      headers: {...headers, "Mcp-Name": "list_skills"}
    });
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32020);
  });

  it("decodes a base64-sentinel Mcp-Name before comparing it", async () => {
    const {body, headers} = modern("tools/call", {
      name: "get_profile",
      arguments: {}
    });
    const encoded = `=?base64?${btoa("get_profile")}?=`;
    const {res, json} = await send(body, {
      headers: {...headers, "Mcp-Name": encoded}
    });
    expect(res.status).toBe(200);
    expect(json.error).toBeUndefined();
  });

  it("rejects a request whose _meta omits clientCapabilities", async () => {
    const {body, headers} = modern("tools/list");
    delete (body.params._meta as Record<string, unknown>)[CAPS];
    const {res, json} = await send(body, {headers});
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32602);
  });

  it("rejects an unsupported protocol version and lists what it supports", async () => {
    const {body, headers} = modern("tools/list", {}, {version: "1900-01-01"});
    const {res, json} = await send(body, {headers});
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32022);
    expect(json.error?.data).toEqual({
      supported: SUPPORTED_PROTOCOL_VERSIONS,
      requested: "1900-01-01"
    });
  });

  it("rejects a legacy version sent as modern per-request metadata", async () => {
    const {body, headers} = modern(
      "tools/list",
      {},
      {version: LEGACY_PROTOCOL_VERSIONS[0]}
    );
    const {res, json} = await send(body, {headers});
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32022);
  });

  it("answers 404 with -32601 for an unknown method", async () => {
    const {res, json} = await callModern("does/not/exist");
    expect(res.status).toBe(404);
    expect(json.error?.code).toBe(-32601);
  });
});

describe("server/discover", () => {
  it("reports supported versions, capabilities, identity and instructions", async () => {
    const {json} = await callModern("server/discover");
    const result = json.result!;
    expect(result.resultType).toBe("complete");
    expect(result.supportedVersions).toEqual(SUPPORTED_PROTOCOL_VERSIONS);
    expect(result.capabilities).toEqual({tools: {}, resources: {}});
    expect((result._meta as Record<string, unknown>)[SERVER_INFO]).toEqual({
      name: "murugappan.dev",
      version: expect.any(String)
    });
    expect(String(result.instructions).length).toBeGreaterThan(120);
  });

  it("answers even without per-request metadata, so a client can probe", async () => {
    const {res, json} = await send(
      {jsonrpc: "2.0", id: 9, method: "server/discover"},
      {headers: {"Mcp-Method": "server/discover"}}
    );
    expect(res.status).toBe(200);
    expect(json.result?.supportedVersions).toEqual(SUPPORTED_PROTOCOL_VERSIONS);
  });
});

describe("tools/list", () => {
  it("returns every tool with its schemas", async () => {
    const {json} = await callModern("tools/list");
    const result = json.result as {
      resultType: string;
      tools: Array<{
        name: string;
        title: string;
        description: string;
        inputSchema: object;
        outputSchema: object;
      }>;
      cacheScope: string;
    };
    expect(result.resultType).toBe("complete");
    expect(result.tools).toHaveLength(8);
    expect(result.cacheScope).toBe("public");
    for (const tool of result.tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.title).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.outputSchema).toBeTruthy();
    }
  });

  it("returns the tools in a stable order across requests", async () => {
    const first = (await callModern("tools/list")).json.result as {
      tools: Array<{name: string}>;
    };
    const second = (await callModern("tools/list")).json.result as {
      tools: Array<{name: string}>;
    };
    expect(first.tools.map(t => t.name)).toEqual(second.tools.map(t => t.name));
  });
});

describe("tools/call", () => {
  it("runs a read tool and returns structured content", async () => {
    const {json} = await callModern("tools/call", {
      name: "get_profile",
      arguments: {}
    });
    const result = json.result as {
      resultType: string;
      isError: boolean;
      structuredContent: {person: {name: string}};
      content: Array<{type: string; text: string}>;
    };
    expect(result.resultType).toBe("complete");
    expect(result.isError).toBe(false);
    expect(result.structuredContent.person.name).toBe("Murugappan M");
    expect(result.content[0].type).toBe("text");
  });

  it("passes arguments through to the tool", async () => {
    const {json} = await callModern("tools/call", {
      name: "get_blog_post",
      arguments: {slug: "coin-change-problem"}
    });
    const result = json.result as {
      structuredContent: {slug: string; markdown: string};
    };
    expect(result.structuredContent.slug).toBe("coin-change-problem");
    expect(result.structuredContent.markdown).toContain("Body text");
  });

  it("reports an unknown tool as a protocol error", async () => {
    const {res, json} = await callModern("tools/call", {
      name: "no_such_tool",
      arguments: {}
    });
    expect(res.status).toBe(200);
    expect(json.error?.code).toBe(-32602);
    expect(json.error?.message).toMatch(/no_such_tool/);
  });

  it("treats a nameless call as a header mismatch, since Mcp-Name is required", async () => {
    const {body, headers} = modern("tools/call", {arguments: {}});
    const {res, json} = await send(body, {headers});
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32020);
  });

  it("reports a recoverable tool failure as isError, not a protocol error", async () => {
    const {json} = await callModern("tools/call", {
      name: "get_blog_post",
      arguments: {slug: "nope"}
    });
    expect(json.error).toBeUndefined();
    const result = json.result as {
      isError: boolean;
      content: Array<{text: string}>;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("search_blog_posts");
  });

  it("rejects non-object arguments as invalid params", async () => {
    const {body, headers} = modern("tools/call", {
      name: "get_profile",
      arguments: "nope"
    });
    const {json} = await send(body, {headers});
    expect(json.error?.code).toBe(-32602);
  });

  it("sends a message through the write tool", async () => {
    const sent: Array<{to: string}> = [];
    const {json} = await callModern(
      "tools/call",
      {
        name: "send_message",
        arguments: {
          name: "Ada Lovelace",
          email: "ada@example.com",
          message: "We are hiring a senior backend engineer for a platform."
        }
      },
      {
        ip: "198.51.100.80",
        options: {
          email: {send: async m => void sent.push(m as {to: string})}
        }
      }
    );
    const result = json.result as {isError: boolean; structuredContent: object};
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual({
      status: "accepted",
      message:
        "Message accepted — Murugappan will reply to the address you gave."
    });
    expect(sent).toHaveLength(1);
  });

  it("shares the contact allowance with the REST endpoint", async () => {
    const args = {
      name: "send_message",
      arguments: {
        email: "ada@example.com",
        message: "A perfectly valid message body for the allowance test."
      }
    };
    for (let i = 0; i < CONTACT_DAILY_PER_CLIENT; i++) {
      const {json} = await callModern("tools/call", args, {
        ip: "198.51.100.81"
      });
      expect((json.result as {isError: boolean}).isError).toBe(false);
    }
    const {json} = await callModern("tools/call", args, {ip: "198.51.100.81"});
    expect((json.result as {isError: boolean}).isError).toBe(true);
  });
});

describe("resources", () => {
  const ORIGIN = "https://murugappan.dev";

  it("lists the site's documents and every post", async () => {
    const {json} = await callModern("resources/list");
    const result = json.result as {
      resultType: string;
      resources: Array<{uri: string; name: string; mimeType: string}>;
      cacheScope: string;
    };
    expect(result.resultType).toBe("complete");
    expect(result.cacheScope).toBe("public");
    expect(result.resources.map(r => r.uri)).toContain(`${ORIGIN}/llms.txt`);
    expect(result.resources.map(r => r.uri)).toContain(
      `${ORIGIN}/blog/coin-change-problem/index.md`
    );
  });

  it("lists the blog post URI template", async () => {
    const {json} = await callModern("resources/templates/list");
    const result = json.result as {
      resultType: string;
      resourceTemplates: Array<{uriTemplate: string}>;
    };
    expect(result.resultType).toBe("complete");
    expect(result.resourceTemplates[0].uriTemplate).toBe(
      `${ORIGIN}/blog/{slug}/index.md`
    );
  });

  it("reads a resource, mirroring the uri in the Mcp-Name header", async () => {
    const uri = `${ORIGIN}/llms.txt`;
    const {res, json} = await callModern("resources/read", {uri});
    expect(res.status).toBe(200);
    const result = json.result as {
      resultType: string;
      contents: Array<{uri: string; mimeType: string; text: string}>;
    };
    expect(result.resultType).toBe("complete");
    expect(result.contents[0].uri).toBe(uri);
    expect(result.contents[0].mimeType).toBe("text/plain");
    expect(result.contents[0].text).toContain("Blog posts");
  });

  it("requires Mcp-Name to match the uri on resources/read", async () => {
    const {body, headers} = modern("resources/read", {
      uri: `${ORIGIN}/llms.txt`
    });
    const {res, json} = await send(body, {
      headers: {...headers, "Mcp-Name": `${ORIGIN}/AGENTS.md`}
    });
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32020);
  });

  it("reads a blog post as markdown", async () => {
    const uri = `${ORIGIN}/blog/coin-change-problem/index.md`;
    const {json} = await callModern("resources/read", {uri});
    const result = json.result as {
      contents: Array<{mimeType: string; text: string}>;
    };
    expect(result.contents[0].mimeType).toBe("text/markdown");
    expect(result.contents[0].text).toContain("Body text");
  });

  it("returns -32602 with the uri for a resource that does not exist", async () => {
    const uri = `${ORIGIN}/nope`;
    const {res, json} = await callModern("resources/read", {uri});
    expect(res.status).toBe(200);
    expect(json.error?.code).toBe(-32602);
    expect(json.error?.data).toEqual({uri});
  });

  it("never answers a read with an empty contents array", async () => {
    const {json} = await callModern("resources/read", {
      uri: `${ORIGIN}/blog/ghost/index.md`
    });
    expect(json.result).toBeUndefined();
    expect(json.error?.code).toBe(-32602);
  });

  it("rejects a read with no uri as invalid params", async () => {
    const {body, headers} = modern("resources/read", {});
    const {json} = await send(body, {
      headers: {...headers, "Mcp-Name": "anything"}
    });
    expect(json.error?.code).toBe(-32020);
  });
});

describe("legacy (initialize-based) clients", () => {
  async function legacy(
    method: string,
    params: Record<string, unknown> = {},
    init: {ip?: string; options?: Options} = {}
  ) {
    return send({jsonrpc: "2.0", id: 1, method, params}, init);
  }

  it("answers initialize with a negotiated legacy version and capabilities", async () => {
    const {res, json} = await legacy("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: {name: "LegacyClient", version: "0.1.0"}
    });
    expect(res.status).toBe(200);
    const result = json.result as {
      protocolVersion: string;
      capabilities: object;
      serverInfo: {name: string};
      instructions: string;
    };
    expect(result.protocolVersion).toBe("2025-06-18");
    expect(result.capabilities).toEqual({tools: {}, resources: {}});
    expect(result.serverInfo.name).toBe("murugappan.dev");
    expect(result.instructions.length).toBeGreaterThan(120);
  });

  it("falls back to its newest legacy version for an unknown request", async () => {
    const {json} = await legacy("initialize", {
      protocolVersion: "1999-01-01",
      capabilities: {}
    });
    expect((json.result as {protocolVersion: string}).protocolVersion).toBe(
      LEGACY_PROTOCOL_VERSIONS[0]
    );
  });

  it("does not put resultType on a legacy result", async () => {
    const {json} = await legacy("initialize", {protocolVersion: "2025-06-18"});
    expect(json.result).not.toHaveProperty("resultType");
  });

  it("answers ping", async () => {
    const {json} = await legacy("ping");
    expect(json.result).toEqual({});
  });

  it("lists tools without requiring the modern headers", async () => {
    const {res, json} = await legacy("tools/list");
    expect(res.status).toBe(200);
    const result = json.result as {tools: unknown[]};
    expect(result.tools).toHaveLength(8);
    expect(json.result).not.toHaveProperty("resultType");
  });

  it("calls a tool without requiring the modern headers", async () => {
    const {json} = await legacy("tools/call", {
      name: "list_skills",
      arguments: {}
    });
    const result = json.result as {
      isError: boolean;
      structuredContent: {skills: unknown[]};
    };
    expect(result.isError).toBe(false);
    expect(result.structuredContent.skills).toHaveLength(1);
  });

  it("rejects a call with no tool name as invalid params", async () => {
    const {json} = await legacy("tools/call", {arguments: {}});
    expect(json.error?.code).toBe(-32602);
  });

  it("rejects an unknown tool as a protocol error", async () => {
    const {json} = await legacy("tools/call", {name: "nope", arguments: {}});
    expect(json.error?.code).toBe(-32602);
  });

  it("lists and reads resources without the modern headers", async () => {
    const list = await legacy("resources/list");
    const resources = (list.json.result as {resources: unknown[]}).resources;
    expect(resources.length).toBeGreaterThan(4);
    expect(list.json.result).not.toHaveProperty("resultType");

    const read = await legacy("resources/read", {
      uri: "https://murugappan.dev/AGENTS.md"
    });
    const contents = (read.json.result as {contents: Array<{text: string}>})
      .contents;
    expect(contents[0].text).toContain("AGENTS.md");
  });

  it("answers an unknown legacy method with 200 and -32601, not 404", async () => {
    const {res, json} = await legacy("prompts/list");
    expect(res.status).toBe(200);
    expect(json.error?.code).toBe(-32601);
  });

  it("names the protocol versions it supports when it cannot serve initialize", async () => {
    const {json} = await legacy("initialize", {protocolVersion: 42});
    const message = JSON.stringify(json);
    for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
      expect(message).toContain(version);
    }
  });
});
