import {describe, expect, it} from "vitest";

import {
  ALLOWED_METHODS,
  API_PATHS,
  matchApiPath,
  SPEC_PATHS
} from "../api/routes";

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
