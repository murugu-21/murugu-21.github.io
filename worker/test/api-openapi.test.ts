import {describe, expect, it} from "vitest";

import {buildOpenApiDocument} from "../api/openapi";
import {
  ALLOWED_METHODS,
  API_PATHS,
  CURRENT_API_VERSION,
  SPEC_PATHS,
  VERSIONED_API_BASE
} from "../api/routes";

const doc = buildOpenApiDocument("https://murugappan.dev");

type Operation = {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Array<Record<string, unknown>>;
  requestBody?: Record<string, unknown>;
  responses?: Record<string, Record<string, unknown>>;
};

function operations(): Array<[string, string, Operation]> {
  const out: Array<[string, string, Operation]> = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(
      item as Record<string, Operation>
    )) {
      out.push([path, method, op]);
    }
  }
  return out;
}

function refs(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) refs(item, found);
  } else if (typeof node === "object" && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") found.push(value);
      else refs(value, found);
    }
  }
  return found;
}

describe("buildOpenApiDocument", () => {
  it("declares OpenAPI 3.1.0", () => {
    expect(doc.openapi).toBe("3.1.0");
  });

  it("names the product in the title and describes it", () => {
    expect(doc.info.title).toContain("murugappan.dev");
    expect(doc.info.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(doc.info.description.length).toBeGreaterThan(80);
    expect(doc.info.contact.url).toBe("https://murugappan.dev/developers/");
  });

  it("points the server at the given origin", () => {
    expect(doc.servers).toEqual([
      {url: "https://murugappan.dev", description: "Production"}
    ]);
  });

  it("publishes every operation under the versioned path prefix", () => {
    for (const path of Object.keys(doc.paths)) {
      expect(path.startsWith(VERSIONED_API_BASE), path).toBe(true);
    }
  });

  it("documents the versioning and deprecation policy agents have to rely on", () => {
    const description = doc.info.description;
    expect(description).toContain(VERSIONED_API_BASE);
    expect(description).toContain(CURRENT_API_VERSION);
    // The two standards a deprecation is announced with, named so a client
    // knows which header shapes to expect.
    expect(description).toContain("RFC 9745");
    expect(description).toContain("RFC 8594");
    expect(description).toContain("Deprecation");
    expect(description).toContain("Sunset");
    expect(description).toContain(API_PATHS.versions);
  });

  it("documents the rate-limit headers it actually sends", () => {
    expect(doc.info.description).toContain("RateLimit-Policy");
    expect(doc.info.description).toContain("Retry-After");
    expect(doc.info.description).toContain("X-RateLimit-Remaining");
  });

  it("points at the MCP manifest and the API catalogue", () => {
    expect(doc.info.description).toContain("/.well-known/mcp.json");
    expect(doc.info.description).toContain("/.well-known/api-catalog");
  });

  it("declares the API as unauthenticated rather than leaving it unsaid", () => {
    expect(doc.security).toEqual([]);
    expect(doc.components.securitySchemes).toEqual({});
  });

  it("documents exactly the paths the router serves", () => {
    expect(Object.keys(doc.paths).sort()).toEqual([...SPEC_PATHS].sort());
  });

  it("documents exactly the methods the router allows on each path", () => {
    for (const [path, item] of Object.entries(doc.paths)) {
      const documented = Object.keys(item as object)
        .map(m => m.toUpperCase())
        .sort();
      expect(documented, path).toEqual([...ALLOWED_METHODS[path]].sort());
    }
  });

  it("gives every operation a unique operationId", () => {
    const ids = operations().map(([, , op]) => op.operationId);
    expect(ids.every(id => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every operation a summary, a description and a tag", () => {
    for (const [path, method, op] of operations()) {
      const where = `${method.toUpperCase()} ${path}`;
      expect(op.summary, where).toBeTruthy();
      expect((op.description ?? "").length, where).toBeGreaterThan(30);
      expect(op.tags?.length, where).toBeGreaterThan(0);
    }
  });

  it("declares every tag it uses", () => {
    const declared = new Set(doc.tags.map(t => t.name));
    for (const [path, method, op] of operations()) {
      for (const tag of op.tags ?? []) {
        expect(declared, `${method} ${path}`).toContain(tag);
      }
    }
  });

  it("types and describes every parameter", () => {
    for (const [path, method, op] of operations()) {
      for (const param of op.parameters ?? []) {
        const where = `${method.toUpperCase()} ${path} ${String(param.name)}`;
        expect(param.name, where).toBeTruthy();
        expect(param.in, where).toBeTruthy();
        expect(param.description, where).toBeTruthy();
        expect(param.schema, where).toBeTruthy();
        expect((param.schema as {type?: string}).type, where).toBeTruthy();
        if (param.in === "path") expect(param.required, where).toBe(true);
      }
    }
  });

  it("gives every path template a matching path parameter", () => {
    for (const [path, method, op] of operations()) {
      for (const name of path.match(/\{(\w+)\}/g) ?? []) {
        const expected = name.slice(1, -1);
        const names = (op.parameters ?? []).map(p => p.name);
        expect(names, `${method.toUpperCase()} ${path}`).toContain(expected);
      }
    }
  });

  it("gives every success status a described JSON response schema", () => {
    for (const [path, method, op] of operations()) {
      const where = `${method.toUpperCase()} ${path}`;
      const success = Object.keys(op.responses ?? {}).filter(s =>
        s.startsWith("2")
      );
      expect(success.length, where).toBeGreaterThan(0);
      for (const status of success) {
        const response = op.responses![status] as {
          description?: string;
          content?: Record<string, {schema?: unknown}>;
        };
        expect(response.description, `${where} ${status}`).toBeTruthy();
        expect(
          response.content?.["application/json"]?.schema,
          `${where} ${status}`
        ).toBeTruthy();
      }
    }
  });

  it("documents the dry-run sandbox on the write operation", () => {
    const contact = doc.paths[API_PATHS.contact] as {post: Operation};
    expect(Object.keys(contact.post.responses!)).toContain("200");
    const schema = doc.components.schemas.ContactRequest as {
      properties: Record<string, unknown>;
    };
    expect(schema.properties.dryRun).toBeTruthy();
  });

  it("documents the 429 the read ceiling can actually produce", () => {
    for (const [path, method, op] of operations()) {
      if (method.toUpperCase() !== "GET") continue;
      expect(
        Object.keys(op.responses ?? {}),
        `${method.toUpperCase()} ${path}`
      ).toContain("429");
    }
  });

  it("documents a machine-readable error body on every failure status", () => {
    for (const [path, method, op] of operations()) {
      const failures = Object.keys(op.responses ?? {}).filter(
        s => s.startsWith("4") || s.startsWith("5")
      );
      expect(
        failures.length,
        `${method.toUpperCase()} ${path}`
      ).toBeGreaterThan(0);
      for (const status of failures) {
        const response = op.responses![status] as {
          content?: Record<string, {schema?: {$ref?: string}}>;
        };
        expect(
          response.content?.["application/json"]?.schema?.$ref,
          `${method.toUpperCase()} ${path} ${status}`
        ).toBe("#/components/schemas/Error");
      }
    }
  });

  it("requires a JSON request body on the write operation", () => {
    const post = doc.paths[API_PATHS.contact] as {post: Operation};
    expect(post.post.requestBody).toMatchObject({
      required: true,
      content: {
        "application/json": {
          schema: {$ref: "#/components/schemas/ContactRequest"}
        }
      }
    });
  });

  it("resolves every $ref against a declared component schema", () => {
    const declared = new Set(Object.keys(doc.components.schemas));
    for (const ref of refs(doc)) {
      expect(ref.startsWith("#/components/schemas/"), ref).toBe(true);
      expect(declared, ref).toContain(ref.replace("#/components/schemas/", ""));
    }
  });

  it("describes every property of every component schema", () => {
    for (const [name, schema] of Object.entries(doc.components.schemas)) {
      const properties = (schema as {properties?: Record<string, unknown>})
        .properties;
      if (!properties) continue;
      for (const [property, value] of Object.entries(properties)) {
        const spec = value as {description?: string; $ref?: string};
        if (spec.$ref) continue;
        expect(spec.description, `${name}.${property}`).toBeTruthy();
      }
    }
  });

  it("documents the WebSocket chat endpoint OpenAPI cannot express", () => {
    expect(doc.info.description).toContain("/parties/chat-room/");
  });

  it("serializes to JSON without cycles", () => {
    expect(() => JSON.stringify(doc)).not.toThrow();
  });
});
