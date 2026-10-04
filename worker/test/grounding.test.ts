import { describe, expect, it } from "vitest";

import { fetchSitePage } from "#worker/fetch-page.ts";
import { getGrounding, type CachedGrounding } from "#worker/grounding.ts";
import { fakeAssets } from "./fixtures";

function fakeStorage(initial: Record<string, CachedGrounding> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    async get(key: string): Promise<unknown> {
      return map.get(key);
    },
    async put(key: string, value: CachedGrounding): Promise<void> {
      map.set(key, value);
    }
  };
}

describe("getGrounding", () => {
  // fakeAssets also serves blog/llms-full.txt, so the first answer proves the
  // root llms.txt was chosen.
  it("grounds on the root llms.txt and serves it from cache on the next call", async () => {
    const storage = fakeStorage();
    expect(await getGrounding(storage, fakeAssets({ "/llms.txt": "FIRST" }))).toBe("FIRST");
    expect(await getGrounding(storage, fakeAssets({ "/llms.txt": "SECOND" }))).toBe("FIRST");
  });

  it("refetches after the TTL, keeping the stale copy while the fetch fails", async () => {
    const storage = fakeStorage({
      "grounding:v2": { text: "STALE", fetchedAt: Date.now() - 25 * 60 * 60 * 1000 }
    });
    expect(await getGrounding(storage, fakeAssets({ "/llms.txt": null }))).toBe("STALE");
    expect(await getGrounding(storage, fakeAssets({ "/llms.txt": "FRESH" }))).toBe("FRESH");
  });
});

describe("fetchSitePage", () => {
  const LLMS_FULL = `# SDE Journey — full content

> Intro.

---

# React Hooks
URL: https://murugappan.dev/blog/react/
Date: 2021-01-01

All about useEffect and friends.

# Another Post
URL: https://murugappan.dev/blog/other/
Date: 2021-02-01

Other content here.`;

  it("rejects non-site hosts", async () => {
    const out = await fetchSitePage(fakeAssets(), "https://evil.example/x");
    expect(out).toContain("Only pages on murugappan.dev");
  });

  it("extracts a blog post section from llms-full by URL", async () => {
    const assets = fakeAssets({ "/blog/llms-full.txt": LLMS_FULL });
    const out = await fetchSitePage(assets, "https://murugappan.dev/blog/react/");
    expect(out).toContain("All about useEffect");
    expect(out).not.toContain("Other content here");
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

  it("reports unknown pages", async () => {
    const out = await fetchSitePage(fakeAssets(), "https://murugappan.dev/nope/");
    expect(out).toContain("not found");
  });
});
