import {describe, expect, it} from "vitest";

import {getGrounding} from "../grounding";

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

function fakeAssets(bodies: Record<string, string | null>) {
  const calls: string[] = [];
  return {
    calls,
    async fetch(input: string): Promise<Response> {
      calls.push(input);
      const path = new URL(input).pathname;
      const body = bodies[path];
      if (body == null) return new Response("not found", {status: 404});
      return new Response(body, {status: 200});
    }
  };
}

describe("getGrounding", () => {
  it("fetches the root llms.txt only and caches under the v2 key", async () => {
    const storage = fakeStorage();
    const assets = fakeAssets({"/llms.txt": "PROFILE + POST SUMMARIES"});
    const text = await getGrounding(storage, assets);
    expect(text).toBe("PROFILE + POST SUMMARIES");
    expect(assets.calls).toHaveLength(1);
    expect(new URL(assets.calls[0]).pathname).toBe("/llms.txt");
    expect(storage.map.get("grounding:v2")).toMatchObject({text});
  });

  it("ignores stale v1 cache entries (full-text blobs)", async () => {
    const storage = fakeStorage({
      "grounding:v1": {text: "HUGE OLD BLOB", fetchedAt: Date.now()}
    });
    const assets = fakeAssets({"/llms.txt": "FRESH"});
    expect(await getGrounding(storage, assets)).toBe("FRESH");
  });

  it("serves from cache within TTL without refetching", async () => {
    const storage = fakeStorage({
      "grounding:v2": {text: "CACHED", fetchedAt: Date.now()}
    });
    const assets = fakeAssets({});
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
    const assets = fakeAssets({"/llms.txt": "FRESH"});
    expect(await getGrounding(storage, assets)).toContain("FRESH");
  });

  it("falls back to stale cache when fetches fail", async () => {
    const storage = fakeStorage({
      "grounding:v2": {
        text: "STALE",
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000
      }
    });
    const assets = fakeAssets({"/llms.txt": null});
    expect(await getGrounding(storage, assets)).toBe("STALE");
  });
});
