import {describe, expect, it} from "vitest";

import {
  ALLOWED_METHODS,
  API_BASE,
  API_PATHS,
  CURRENT_API_VERSION,
  matchApiPath,
  SPEC_PATHS,
  toVersionedPath,
  VERSIONED_API_BASE
} from "../api/routes";

describe("the versioned surface", () => {
  it("publishes every endpoint under /api/<version>", () => {
    expect(VERSIONED_API_BASE).toBe(`${API_BASE}/${CURRENT_API_VERSION}`);
    for (const path of Object.values(API_PATHS)) {
      if (path === API_PATHS.openapiRoot) continue;
      expect(path.startsWith(VERSIONED_API_BASE), path).toBe(true);
    }
  });
});

describe("toVersionedPath", () => {
  it("rewrites the unversioned alias onto the versioned template", () => {
    expect(toVersionedPath("/api/profile")).toBe("/api/v1/profile");
    expect(toVersionedPath("/api/posts/some-slug")).toBe(
      "/api/v1/posts/some-slug"
    );
  });

  it("leaves an already-versioned path alone", () => {
    expect(toVersionedPath("/api/v1/profile")).toBe("/api/v1/profile");
  });

  it("leaves a bare prefix alone — neither names an endpoint", () => {
    expect(toVersionedPath("/api")).toBe("/api");
    expect(toVersionedPath("/api/v1")).toBe("/api/v1");
  });

  it("leaves paths outside the API alone", () => {
    expect(toVersionedPath("/openapi.json")).toBe("/openapi.json");
    expect(toVersionedPath("/blog/some-post")).toBe("/blog/some-post");
  });
});

describe("matchApiPath", () => {
  it("matches a literal endpoint path", () => {
    expect(matchApiPath("/api/profile")).toBe(API_PATHS.profile);
    expect(matchApiPath("/api/open-source")).toBe(API_PATHS.openSource);
  });

  it("ignores a trailing slash", () => {
    expect(matchApiPath("/api/profile/")).toBe(API_PATHS.profile);
  });

  it("matches a post path to its templated form", () => {
    expect(matchApiPath("/api/posts/coin-change-problem")).toBe(API_PATHS.post);
    expect(matchApiPath("/api/posts/coin-change-problem/")).toBe(
      API_PATHS.post
    );
  });

  it("prefers the literal collection path over the template", () => {
    expect(matchApiPath("/api/posts")).toBe(API_PATHS.posts);
  });

  it("returns null for an unknown path", () => {
    expect(matchApiPath("/api/nope")).toBeNull();
    expect(matchApiPath("/api/posts/a/b")).toBeNull();
    expect(matchApiPath("/api")).toBeNull();
  });

  it("matches the spec paths served outside /api too", () => {
    expect(matchApiPath("/openapi.json")).toBe(API_PATHS.openapiRoot);
  });

  it("matches the versioned form of every endpoint", () => {
    expect(matchApiPath("/api/v1/profile")).toBe(API_PATHS.profile);
    expect(matchApiPath("/api/v1/posts/coin-change-problem")).toBe(
      API_PATHS.post
    );
    expect(matchApiPath("/api/v1/versions")).toBe(API_PATHS.versions);
  });

  it("maps the unversioned alias to the same template as the versioned path", () => {
    expect(matchApiPath("/api/versions")).toBe(API_PATHS.versions);
    expect(matchApiPath("/api/open-source")).toBe(
      matchApiPath("/api/v1/open-source")
    );
  });

  it("returns null for a version that does not exist", () => {
    expect(matchApiPath("/api/v2/profile")).toBeNull();
    expect(matchApiPath("/api/v1")).toBeNull();
  });
});

describe("ALLOWED_METHODS", () => {
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

describe("SPEC_PATHS", () => {
  it("lists every documented path except the spec's own aliases", () => {
    expect(SPEC_PATHS).not.toContain(API_PATHS.openapiRoot);
    expect(SPEC_PATHS).toContain(API_PATHS.profile);
    expect(SPEC_PATHS).toContain(API_PATHS.post);
  });
});
