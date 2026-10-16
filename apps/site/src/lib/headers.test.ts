import { describe, expect, it } from "vite-plus/test";

import { headersFile } from "./headers";

describe("headersFile", () => {
  const file = headersFile();

  it("links the developer portal to the spec, the guides, the catalogue and the version history", () => {
    expect(file).toContain(
      [
        "/developers/",
        '  Link: </openapi.json>; rel="service-desc"; type="application/json", </AGENTS.md>; rel="describedby"; type="text/markdown", </llms.txt>; rel="describedby"; type="text/plain", </.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json", </api/v1/versions>; rel="version-history"; type="application/json"',
        "",
        ""
      ].join("\n")
    );
  });

  it("gives a document its own headers and then the registry's Link line", () => {
    expect(file).toContain(
      [
        "/AGENTS.md",
        "  Content-Type: text/markdown; charset=utf-8",
        "  Cache-Control: public, max-age=3600",
        '  Link: </openapi.json>; rel="service-desc"; type="application/json", </developers/>; rel="service-doc"; type="text/html", </.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
        "",
        "/llms.txt",
        "  Cache-Control: public, max-age=3600"
      ].join("\n")
    );
  });

  it("ends with the asset blocks and a trailing newline", () => {
    const lastBlock =
      "\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n";
    expect(file.slice(-lastBlock.length)).toBe(lastBlock);
    expect(file).toContain(
      "\n\n/static/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/blog/rss.xml\n  Content-Type: application/rss+xml; charset=utf-8\n\n"
    );
  });
});
