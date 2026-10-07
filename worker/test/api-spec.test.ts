// The API's contract as data: the router, the version catalogue and the OpenAPI
// document, checked against each other.
import { assert, describe, expect, it } from "vitest";

import { api } from "#worker/api/index.ts";
import { buildOpenApiDocument } from "#worker/api/openapi.ts";
import { API_PATHS, VERSIONED_API_BASE } from "#contracts/api/routes.ts";
import { CURRENT_VERSION_RECORD, type VersionRecord } from "#contracts/api/versioning.ts";
import {
  buildVersionsDocument,
  versionHeaders,
  versionLinkHeader
} from "#worker/api/versioning.ts";

describe("version headers", () => {
  const deprecated: VersionRecord = {
    ...CURRENT_VERSION_RECORD,
    status: "deprecated",
    deprecatedOn: "2027-01-01",
    sunsetOn: "2027-07-01",
    successor: "v2"
  };

  it("names only the release and the supported versions while nothing is deprecated", () => {
    expect(versionHeaders()).toEqual({
      "API-Version": "1.0.0",
      "API-Supported-Versions": "v1"
    });
  });

  it("announces a deprecation with the RFC 9745 and RFC 8594 fields", () => {
    const headers = versionHeaders(deprecated);
    // RFC 9745: a Date structured field, "@" then a Unix timestamp.
    expect(headers.Deprecation).toBe("@1798761600");
    // RFC 8594: an HTTP-date, the same format Retry-After uses.
    expect(headers.Sunset).toBe("Thu, 01 Jul 2027 00:00:00 GMT");
  });

  it("links the spec, the docs and the version history", () => {
    const link = versionLinkHeader();
    expect(link).toContain('</openapi.json>; rel="service-desc"');
    expect(link).toContain('</developers/>; rel="service-doc"');
    expect(link).toContain('</api/v1/versions>; rel="version-history"');
    expect(link).toContain('rel="latest-version"');
    expect(link).toContain('rel="api-catalog"');
  });

  it("adds the migration pointers only once a version is deprecated", () => {
    const link = versionLinkHeader();
    expect(link).not.toContain('rel="deprecation"');
    expect(link).not.toContain('rel="successor-version"');
    const deprecatedLink = versionLinkHeader(deprecated);
    expect(deprecatedLink).toContain('</developers/#versioning>; rel="deprecation"');
    expect(deprecatedLink).toContain('</api/v2>; rel="successor-version"');
  });
});

describe("buildVersionsDocument", () => {
  const doc = buildVersionsDocument("https://murugappan.dev");

  it("makes every URL absolute against the host that was asked", () => {
    expect(doc.versions[0].url).toBe("https://murugappan.dev/api/v1");
    expect(doc.versions[0].specUrl).toBe("https://murugappan.dev/openapi.json");
    expect(doc.policy.documentationUrl).toBe("https://murugappan.dev/developers/#versioning");
  });
});

describe("buildOpenApiDocument", () => {
  const doc = buildOpenApiDocument("https://murugappan.dev");

  type Operation = NonNullable<(typeof doc.paths)[string]["get"]>;

  function operations(): Array<[string, Operation]> {
    return Object.entries(doc.paths).flatMap(([path, item]) =>
      Object.entries(item).map(([method, op]): [string, Operation] => [
        `${method.toUpperCase()} ${path}`,
        op
      ])
    );
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

  /* oxlint-disable tests/observe-behaviour -- relation: spec paths against the router's own table */
  it("documents exactly the paths and methods the router serves", () => {
    // HEAD rides along with GET and is not a separate operation; ALL is middleware or the 404.
    const served = api.routes
      .filter(r => r.method !== "ALL" && r.method !== "HEAD")
      .map(r => `${r.method} ${VERSIONED_API_BASE}${r.path.replaceAll(/:(\w+)/g, "{$1}")}`);
    const documented = Object.entries(doc.paths).flatMap(([path, item]) =>
      Object.keys(item).map(method => `${method.toUpperCase()} ${path}`)
    );
    expect(documented.sort()).toEqual([...new Set(served)].sort());
  });
  /* oxlint-enable tests/observe-behaviour */

  it("gives every operation a unique operationId", () => {
    const ids = operations().map(([, op]) => op.operationId);
    expect(ids.every(id => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every operation a summary, a description and a declared tag", () => {
    const declared = new Set(doc.tags.map(t => t.name));
    for (const [where, op] of operations()) {
      expect(op.summary, where).toMatch(/\S/);
      expect(op.description, where).toMatch(/\S/);
      expect(op.tags.length, where).toBeGreaterThan(0);
      for (const tag of op.tags) expect(declared, where).toContain(tag);
    }
  });

  it("types and describes every parameter, and every path template has one", () => {
    for (const [where, op] of operations()) {
      const params = op.parameters ?? [];
      for (const param of params) {
        const at = `${where} ${param.name}`;
        expect(param.name, at).toMatch(/^[a-z][a-zA-Z]*$/);
        expect(param.in, at).toMatch(/^(path|query)$/);
        expect(param.description, at).toMatch(/\S/);
        expect(param.schema.type, at).toMatch(/^(string|integer|number|boolean|array|object)$/);
      }
      const templates = (where.match(/\{(\w+)\}/g) ?? []).map(t => t.slice(1, -1));
      const pathParams = params.filter(p => p.in === "path");
      expect(pathParams.map(p => p.name).sort(), where).toEqual(templates.sort());
      expect(
        pathParams.every(p => p.required === true),
        where
      ).toBe(true);
    }
  });

  it("gives every success status a described JSON response schema", () => {
    for (const [where, op] of operations()) {
      const responses = op.responses;
      const success = Object.keys(responses).filter(s => s.startsWith("2"));
      expect(success.length, where).toBeGreaterThan(0);
      for (const status of success) {
        const response = responses[status];
        expect(response.description, `${where} ${status}`).toMatch(/\S/);
        expect(Object.keys(response.content ?? {}), `${where} ${status}`).toEqual([
          "application/json"
        ]);
        expect(response.content?.["application/json"]?.schema, `${where} ${status}`).toBeTypeOf(
          "object"
        );
      }
    }
  });

  it("documents a machine-readable error body on every failure status", () => {
    for (const [where, op] of operations()) {
      const responses = op.responses;
      const failures = Object.keys(responses).filter(s => s.startsWith("4") || s.startsWith("5"));
      expect(failures.length, where).toBeGreaterThan(0);
      for (const status of failures) {
        const response = responses[status];
        expect(response.content?.["application/json"]?.schema?.$ref, `${where} ${status}`).toBe(
          "#/components/schemas/Error"
        );
      }
    }
  });

  it("documents the 429 the read ceiling can produce", () => {
    for (const [where, op] of operations()) {
      if (!where.startsWith("GET ")) continue;
      expect(Object.keys(op.responses), where).toContain("429");
    }
  });

  it("requires a JSON request body on the write operation, with the dry-run sandbox", () => {
    const contact = doc.paths[API_PATHS.contact].post;
    assert(contact, "the contact path has no POST operation");
    expect(contact.requestBody).toMatchObject({
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ContactRequest" }
        }
      }
    });
    expect(Object.keys(contact.responses)).toContain("200");
    expect(doc.components.schemas.ContactRequest.properties?.dryRun).toMatchObject({
      type: ["boolean", "null"],
      default: false
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
    for (const [name, { properties }] of Object.entries(doc.components.schemas)) {
      for (const [property, spec] of Object.entries(properties ?? {})) {
        if (typeof spec === "boolean" || spec.$ref) continue;
        expect(spec.description, `${name}.${property}`).toMatch(/\S/);
      }
    }
  });
});
