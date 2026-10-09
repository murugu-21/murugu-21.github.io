import { describe, expect, it } from "vitest";

import { fetchSitePage } from "#src/fetch-page.ts";
import { fakeAssets } from "./fixtures";

describe("fetchSitePage", () => {
  const REACT = "---\ntitle: React Hooks\n---\n\nAll about useEffect and friends.\n";
  const BLOG_INDEX =
    "# SDE Journey\n\n## Posts\n- [React Hooks](https://murugappan.dev/blog/react/)\n";

  it("explains a URL that cannot be parsed", async () => {
    expect(await fetchSitePage(fakeAssets(), "http://[")).toBe("That is not a valid URL.");
  });

  it("rejects non-site hosts", async () => {
    const out = await fetchSitePage(fakeAssets(), "https://evil.example/x");
    expect(out).toContain("Only pages on murugappan.dev");
  });

  it("reads a post's index.md rendition, with or without the trailing slash", async () => {
    const assets = fakeAssets({ "/blog/react/index.md": REACT });
    expect(await fetchSitePage(assets, "https://murugappan.dev/blog/react/")).toBe(REACT);
    expect(await fetchSitePage(assets, "/blog/react")).toBe(REACT);
  });

  it("reads /blog/ and /blog as the blog index rendition", async () => {
    const assets = fakeAssets({ "/blog/index.md": BLOG_INDEX, "/blog/react/index.md": REACT });
    expect(await fetchSitePage(assets, "https://murugappan.dev/blog/")).toBe(BLOG_INDEX);
    // llms.txt links the blog without the slash, and Jarvis passes URLs on as written.
    expect(await fetchSitePage(assets, "https://murugappan.dev/blog")).toBe(BLOG_INDEX);
  });

  it("falls back to stripping page HTML", async () => {
    const assets = fakeAssets({
      "/resume/": `<html><head><style>.x{}</style></head><body><script>bad()</script><main><h1>Resume</h1><p>Software &amp; systems</p></main></body></html>`
    });
    const out = await fetchSitePage(assets, "https://murugappan.dev/resume/");
    expect(out).toContain("Resume");
    expect(out).toContain("Software & systems");
    expect(out).not.toContain("bad()");
    expect(out).not.toContain("<p>");
  });

  it("reads all of a page's main content, every card in it, without the nav", async () => {
    const assets = fakeAssets({
      "/about/": `<body><header><nav>Home Blog</nav></header><main><h1>About</h1><article>MedMe</article><article>HyperVerge</article></main></body>`
    });
    expect(await fetchSitePage(assets, "/about/")).toBe("About MedMe HyperVerge");
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
