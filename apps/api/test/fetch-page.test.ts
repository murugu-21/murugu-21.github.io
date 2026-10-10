import { describe, expect, it } from "vitest";

import { fetchSitePage } from "#src/fetch-page.ts";
import { fakeAssets } from "./fixtures";

describe("fetchSitePage", () => {
  const REACT = "---\ntitle: React Hooks\n---\n\nAll about useEffect and friends.\n";
  const ABOUT = "# About Murugappan M\n\nFull Stack Engineer\n";
  const BLOG_INDEX =
    "# SDE Journey\n\n## Posts\n- [React Hooks](https://murugappan.dev/blog/react/)\n";

  it("explains a URL that cannot be parsed", async () => {
    expect(await fetchSitePage(fakeAssets(), "http://[")).toBe("That is not a valid URL.");
  });

  it("rejects non-site hosts", async () => {
    const out = await fetchSitePage(fakeAssets(), "https://evil.example/x");
    expect(out).toContain("Only pages on murugappan.dev");
  });

  it("prefers a page's index.md rendition to its HTML, with or without the trailing slash", async () => {
    const assets = fakeAssets({
      "/about/": "<body><main><h1>About</h1></main></body>",
      "/about/index.md": ABOUT,
      "/blog/index.md": BLOG_INDEX,
      "/blog/react/index.md": REACT
    });
    expect(await fetchSitePage(assets, "https://murugappan.dev/about/")).toBe(ABOUT);
    expect(await fetchSitePage(assets, "/blog/react")).toBe(REACT);
    // llms.txt links the blog without the slash, and Jarvis passes URLs on as written.
    expect(await fetchSitePage(assets, "https://murugappan.dev/blog")).toBe(BLOG_INDEX);
  });

  it("falls back to stripping page HTML", async () => {
    const assets = fakeAssets({
      "/developers/": `<html><head><style>.x{}</style></head><body><script>bad()</script><main><h1>Developers</h1><p>Software &amp; systems</p></main></body></html>`
    });
    const out = await fetchSitePage(assets, "https://murugappan.dev/developers/");
    expect(out).toContain("Developers");
    expect(out).toContain("Software & systems");
    expect(out).not.toContain("bad()");
    expect(out).not.toContain("<p>");
  });

  it("reads all of a page's main content, every card in it, without the nav", async () => {
    const assets = fakeAssets({
      "/developers/": `<body><header><nav>Home Blog</nav></header><main><h1>Developers</h1><article>REST</article><article>MCP</article></main></body>`
    });
    expect(await fetchSitePage(assets, "/developers/")).toBe("Developers REST MCP");
  });

  it("serves a text file as written, angle brackets and all", async () => {
    const assets = fakeAssets({ "/blog/notes.txt": "Wrap it in <Suspense> first." });
    expect(await fetchSitePage(assets, "/blog/notes.txt")).toBe("Wrap it in <Suspense> first.");
  });

  it("says so when a page has nothing but markup", async () => {
    const assets = fakeAssets({ "/empty/": "<body><script>track()</script></body>" });
    expect(await fetchSitePage(assets, "/empty/")).toBe("That page has no readable text.");
  });

  it("reports unknown pages", async () => {
    const out = await fetchSitePage(fakeAssets(), "https://murugappan.dev/nope/");
    expect(out).toContain("not found");
  });
});
