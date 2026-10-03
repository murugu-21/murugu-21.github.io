// The API's contract as data: the route table, the version catalogue and the
// OpenAPI document generated from them, checked against each other.
import { assert, describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "../api/openapi";
import {
  ALLOWED_METHODS,
  API_BASE,
  API_PATHS,
  matchApiPath,
  SPEC_PATHS,
  toVersionedPath,
  VERSIONED_API_BASE
} from "../api/routes";
import {
  buildVersionsDocument,
  CURRENT_VERSION_RECORD,
  versionHeaders,
  versionLinkHeader,
  type VersionRecord
} from "../api/versioning";

describe("the route table", () => {
  it("declares the methods for every known path", () => {
    for (const path of Object.values(API_PATHS)) {
      expect(ALLOWED_METHODS[path], path).toBeDefined();
      expect(ALLOWED_METHODS[path].length, path).toBeGreaterThan(0);
    }
  });

  it("makes contact the only write endpoint", () => {
    const writes = Object.entries(ALLOWED_METHODS)
      .filter(([, methods]) => methods.some(m => m !== "GET"))
      .map(([path]) => path);
    expect(writes).toEqual([API_PATHS.contact]);
  });
});

describe("toVersionedPath", () => {
  it.each([
    ["/api/profile", "/api/v1/profile"],
    ["/api/posts/some-slug", "/api/v1/posts/some-slug"],
    ["/api/v1/profile", "/api/v1/profile"],
    // A bare prefix names no endpoint, so it is left alone.
    ["/api", "/api"],
    ["/api/v1", "/api/v1"],
    ["/openapi.json", "/openapi.json"],
    ["/blog/some-post", "/blog/some-post"]
  ])("maps %s to %s", (input, expected) => {
    expect(toVersionedPath(input)).toBe(expected);
  });
});

describe("matchApiPath", () => {
  it.each([
    ["/api/profile", API_PATHS.profile],
    ["/api/open-source", API_PATHS.openSource],
    ["/api/profile/", API_PATHS.profile],
    ["/api/posts/coin-change-problem", API_PATHS.post],
    ["/api/posts/coin-change-problem/", API_PATHS.post],
    // The literal collection path wins over the {slug} template.
    ["/api/posts", API_PATHS.posts],
    ["/openapi.json", API_PATHS.openapiRoot],
    ["/api/v1/profile", API_PATHS.profile],
    ["/api/v1/posts/coin-change-problem", API_PATHS.post],
    ["/api/v1/versions", API_PATHS.versions],
    ["/api/versions", API_PATHS.versions],
    ["/api/nope", null],
    ["/api/posts/a/b", null],
    ["/api", null],
    ["/api/v1", null],
    ["/api/v2/profile", null]
  ])("matches %s to %s", (input, expected) => {
    expect(matchApiPath(input)).toBe(expected);
  });
});

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
      "API-Version": CURRENT_VERSION_RECORD.release,
      "API-Supported-Versions": CURRENT_VERSION_RECORD.version
    });
  });

  it("announces a deprecation with the RFC 9745 and RFC 8594 fields", () => {
    const headers = versionHeaders(deprecated);
    // RFC 9745: a Date structured field — "@" then a Unix timestamp.
    expect(headers.Deprecation).toBe("@1798761600");
    // RFC 8594: an HTTP-date, the same format Retry-After uses.
    expect(headers.Sunset).toBe("Thu, 01 Jul 2027 00:00:00 GMT");
  });

  it("links the spec, the docs and the version history", () => {
    const link = versionLinkHeader();
    expect(link).toContain(`<${API_PATHS.openapiRoot}>; rel="service-desc"`);
    expect(link).toContain('rel="service-doc"');
    expect(link).toContain(`<${API_PATHS.versions}>; rel="version-history"`);
    expect(link).toContain('rel="latest-version"');
    expect(link).toContain('rel="api-catalog"');
  });

  it("adds the migration pointers only once a version is deprecated", () => {
    const link = versionLinkHeader();
    expect(link).not.toContain('rel="deprecation"');
    expect(link).not.toContain('rel="successor-version"');
    const deprecatedLink = versionLinkHeader(deprecated);
    expect(deprecatedLink).toContain('rel="deprecation"');
    expect(deprecatedLink).toContain(`<${API_BASE}/v2>; rel="successor-version"`);
  });
});

describe("buildVersionsDocument", () => {
  const doc = buildVersionsDocument("https://murugappan.dev");

  it("names the current version and pins the unversioned alias to it", () => {
    expect(doc.current).toBe(CURRENT_VERSION_RECORD.version);
    expect(doc.currentRelease).toBe(CURRENT_VERSION_RECORD.release);
    expect(doc.unversionedAlias.basePath).toBe(API_BASE);
    expect(doc.unversionedAlias.pinnedTo).toBe(CURRENT_VERSION_RECORD.version);
  });

  it("makes every URL absolute against the host that was asked", () => {
    expect(doc.versions[0].url).toBe(`https://murugappan.dev${VERSIONED_API_BASE}`);
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

  // The description is the only place OpenAPI lets us document the versioning
  // policy, the rate-limit headers and the surfaces it cannot express.
  it("points agents at the policy, the headers and the other surfaces", () => {
    for (const reference of [
      VERSIONED_API_BASE,
      API_PATHS.versions,
      "RFC 9745",
      "RFC 8594",
      "RateLimit-Policy",
      "Retry-After",
      "X-RateLimit-Remaining",
      "/.well-known/mcp.json",
      "/.well-known/api-catalog",
      "/parties/chat-room/"
    ]) {
      expect(doc.info.description).toContain(reference);
    }
  });

  it("declares the API as unauthenticated rather than leaving it unsaid", () => {
    expect(doc.security).toEqual([]);
    expect(doc.components.securitySchemes).toEqual({});
  });

  it("documents exactly the paths and methods the router serves", () => {
    expect(Object.keys(doc.paths).sort()).toEqual([...SPEC_PATHS].sort());
    for (const [path, item] of Object.entries(doc.paths)) {
      const documented = Object.keys(item)
        .map(m => m.toUpperCase())
        .sort();
      expect(documented, path).toEqual([...ALLOWED_METHODS[path]].sort());
    }
  });

  it("gives every operation a unique operationId", () => {
    const ids = operations().map(([, op]) => op.operationId);
    expect(ids.every(id => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every operation a summary, a description and a declared tag", () => {
    const declared = new Set(doc.tags.map(t => t.name));
    for (const [where, op] of operations()) {
      expect(op.summary, where).toBeTruthy();
      expect(op.description, where).toBeTruthy();
      expect(op.tags.length, where).toBeGreaterThan(0);
      for (const tag of op.tags) expect(declared, where).toContain(tag);
    }
  });

  it("types and describes every parameter, and every path template has one", () => {
    for (const [where, op] of operations()) {
      for (const param of op.parameters ?? []) {
        const at = `${where} ${String(param.name)}`;
        expect(param.name, at).toBeTruthy();
        expect(param.in, at).toBeTruthy();
        expect(param.description, at).toBeTruthy();
        expect(param.schema.type, at).toBeTruthy();
        if (param.in === "path") expect(param.required, at).toBe(true);
      }
      const names = (op.parameters ?? []).map(p => p.name);
      for (const template of where.match(/\{(\w+)\}/g) ?? []) {
        expect(names, where).toContain(template.slice(1, -1));
      }
    }
  });

  it("gives every success status a described JSON response schema", () => {
    for (const [where, op] of operations()) {
      const responses = op.responses;
      const success = Object.keys(responses).filter(s => s.startsWith("2"));
      expect(success.length, where).toBeGreaterThan(0);
      for (const status of success) {
        const response = responses[status];
        expect(response.description, `${where} ${status}`).toBeTruthy();
        expect(response.content?.["application/json"]?.schema, `${where} ${status}`).toBeTruthy();
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

  it("documents the 429 the read ceiling can actually produce", () => {
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
    expect(doc.components.schemas.ContactRequest.properties?.dryRun).toBeTruthy();
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
        if (spec.$ref) continue;
        expect(spec.description, `${name}.${property}`).toBeTruthy();
      }
    }
  });
});
