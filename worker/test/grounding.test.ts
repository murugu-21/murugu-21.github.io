import { describe, expect, it } from "vitest";

import { fetchSitePage } from "../fetch-page";
import { getGrounding } from "../grounding";
import { fakeAssets } from "./fixtures";

function fakeStorage(initial: Record<string, unknown> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    async get<T>(key: string): Promise<T | undefined> {
      return map.get(key) as T | undefined;
    },
    async put(key: string, value: unknown): Promise<void> {
      map.set(key, value);
    }
  };
}

// Records every fetch, to prove when the cache answered instead.
function countingAssets(bodies: Record<string, string | null>) {
  const calls: string[] = [];
  return {
    calls,
    async fetch(input: string): Promise<Response> {
      calls.push(input);
      const path = new URL(input).pathname;
      const body = bodies[path];
      if (body == null) return new Response("not found", { status: 404 });
      return new Response(body, { status: 200 });
    }
  };
}

describe("getGrounding", () => {
  it("fetches the root llms.txt only and caches under the v2 key", async () => {
    const storage = fakeStorage();
    const assets = countingAssets({ "/llms.txt": "PROFILE + POST SUMMARIES" });
    const text = await getGrounding(storage, assets);
    expect(text).toBe("PROFILE + POST SUMMARIES");
    expect(assets.calls).toHaveLength(1);
    expect(new URL(assets.calls[0]).pathname).toBe("/llms.txt");
    expect(storage.map.get("grounding:v2")).toMatchObject({ text });
  });

  it("ignores stale v1 cache entries (full-text blobs)", async () => {
    const storage = fakeStorage({
      "grounding:v1": { text: "HUGE OLD BLOB", fetchedAt: Date.now() }
    });
    const assets = countingAssets({ "/llms.txt": "FRESH" });
    expect(await getGrounding(storage, assets)).toBe("FRESH");
  });

  it("serves from cache within TTL without refetching", async () => {
    const storage = fakeStorage({
      "grounding:v2": { text: "CACHED", fetchedAt: Date.now() }
    });
    const assets = countingAssets({});
    expect(await getGrounding(storage, assets)).toBe("CACHED");
    expect(assets.calls).toHaveLength(0);
  });

  it("refetches after TTL expiry", async () => {
    const storage = fakeStorage({
      "grounding:v2": {
        text: "STALE",
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000
      }
    });
    const assets = countingAssets({ "/llms.txt": "FRESH" });
    expect(await getGrounding(storage, assets)).toContain("FRESH");
  });

  it("falls back to stale cache when fetches fail", async () => {
    const storage = fakeStorage({
      "grounding:v2": {
        text: "STALE",
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000
      }
    });
    const assets = countingAssets({ "/llms.txt": null });
    expect(await getGrounding(storage, assets)).toBe("STALE");
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
