import { describe, expect, it } from "vite-plus/test";

import { entryPoints, linkHeader } from "./surface.ts";

describe("linkHeader", () => {
  it("renders the home page's relations in the registry's order, typed where the target has one", () => {
    expect(linkHeader("/")).toBe(
      '</llms.txt>; rel="describedby"; type="text/plain", </about/>; rel="author", </blog/rss.xml>; rel="alternate"; type="application/rss+xml", </openapi.json>; rel="service-desc"; type="application/json", </developers/>; rel="service-doc"; type="text/html", </.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"'
    );
  });

  it("renders the API's relations, with the current version's base path as latest-version", () => {
    expect(linkHeader("api")).toBe(
      '</openapi.json>; rel="service-desc"; type="application/json", </developers/>; rel="service-doc"; type="text/html", </api/v1/versions>; rel="version-history"; type="application/json", </api/v1>; rel="latest-version", </.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"'
    );
  });
});

describe("entryPoints", () => {
  it("lists each entry point as an absolute markdown link, in the registry's order", () => {
    expect(entryPoints()).toMatch(
      /^- \[Every indexable URL on this site\]\(https:\/\/murugappan\.dev\/sitemap\.xml\)\n- \[Site summary for LLMs\]\(https:\/\/murugappan\.dev\/llms\.txt\)\n/
    );
    const lastEntry =
      "\n- [Full text of every blog post](https://murugappan.dev/blog/llms-full.txt)";
    expect(entryPoints().slice(-lastEntry.length)).toBe(lastEntry);
  });
});
