import { describe, expect, it } from "vite-plus/test";

import { DOCUMENTS, type SurfaceDocument } from "@murugappan/contracts/surface.ts";

import { get, mediaType } from "./server.ts";

const typedDocuments = Object.values<SurfaceDocument>(DOCUMENTS).flatMap(({ path, type }) =>
  type === undefined ? [] : [{ path, type }]
);

describe("discovery documents", () => {
  it.each(typedDocuments)("serves $path as $type", async ({ path, type }) => {
    const response = await get(path);
    expect([response.status, mediaType(response)]).toEqual([200, type]);
  });
});

describe("Link header", () => {
  it("names the home page's relations in the registry's order, then its markdown rendition", async () => {
    const response = await get("/");
    expect(response.headers.get("Link")).toBe(
      '</llms.txt>; rel="describedby"; type="text/plain", </about/>; rel="author", </blog/rss.xml>; rel="alternate"; type="application/rss+xml", </openapi.json>; rel="service-desc"; type="application/json", </developers/>; rel="service-doc"; type="text/html", </.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json", </index.md>; rel="alternate"; type="text/markdown"'
    );
  });

  it.each([
    {
      path: "/about/",
      link: '</llms.txt>; rel="describedby"; type="text/plain", </openapi.json>; rel="service-desc"; type="application/json", </developers/>; rel="service-doc"; type="text/html", </.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json", </about/index.md>; rel="alternate"; type="text/markdown"'
    },
    {
      path: "/developers/",
      link: '</openapi.json>; rel="service-desc"; type="application/json", </AGENTS.md>; rel="describedby"; type="text/markdown", </llms.txt>; rel="describedby"; type="text/plain", </.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json", </api/v1/versions>; rel="version-history"; type="application/json"'
    },
    {
      path: "/api/v1/profile",
      link: '</openapi.json>; rel="service-desc"; type="application/json", </developers/>; rel="service-doc"; type="text/html", </api/v1/versions>; rel="version-history"; type="application/json", </api/v1>; rel="latest-version", </.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"'
    }
  ])("names the registry's relations on $path", async ({ path, link }) => {
    const response = await get(path);
    expect(response.headers.get("Link")).toBe(link);
  });
});

describe("content negotiation", () => {
  it("answers /about/ with its markdown rendition when Accept ranks text/markdown first", async () => {
    const response = await get("/about/", { Accept: "text/markdown" });
    expect([
      response.status,
      response.headers.get("Content-Type"),
      response.headers.get("Vary")
    ]).toEqual([200, "text/markdown; charset=utf-8", "Accept"]);
  });

  it("answers /about/ with HTML otherwise", async () => {
    const response = await get("/about/", { Accept: "*/*" });
    expect([
      response.status,
      response.headers.get("Content-Type"),
      response.headers.get("Vary")
    ]).toEqual([200, "text/html; charset=utf-8", "Accept"]);
  });

  it("answers an unknown path with a markdown 404 for */*", async () => {
    const response = await get("/no-such-page", { Accept: "*/*" });
    expect([response.status, response.headers.get("Content-Type")]).toEqual([
      404,
      "text/markdown; charset=utf-8"
    ]);
    expect(await response.text()).toContain("`/no-such-page` is not a path on murugappan.dev");
  });

  it("answers an unknown path with the styled page for text/html", async () => {
    const response = await get("/no-such-page", { Accept: "text/html" });
    expect([response.status, response.headers.get("Content-Type")]).toEqual([
      404,
      "text/html; charset=utf-8"
    ]);
    expect(await response.text()).toContain("<!DOCTYPE html>");
  });
});
