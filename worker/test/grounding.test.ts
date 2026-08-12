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
  it("fetches both llms files, concatenates and caches", async () => {
    const storage = fakeStorage();
    const assets = fakeAssets({
      "/llms.txt": "PROFILE",
      "/blog/llms-full.txt": "POSTS"
    });
    const text = await getGrounding(storage, assets);
    expect(text).toContain("PROFILE");
    expect(text).toContain("POSTS");
    expect(storage.map.get("grounding:v1")).toMatchObject({text});
  });

  it("serves from cache within TTL without refetching", async () => {
    const storage = fakeStorage({
      "grounding:v1": {text: "CACHED", fetchedAt: Date.now()}
    });
    const assets = fakeAssets({});
    expect(await getGrounding(storage, assets)).toBe("CACHED");
    expect(assets.calls).toHaveLength(0);
  });

  it("refetches after TTL expiry", async () => {
    const storage = fakeStorage({
      "grounding:v1": {
        text: "STALE",
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000
      }
    });
    const assets = fakeAssets({
      "/llms.txt": "FRESH",
      "/blog/llms-full.txt": ""
    });
    expect(await getGrounding(storage, assets)).toContain("FRESH");
  });

  it("falls back to stale cache when fetches fail", async () => {
    const storage = fakeStorage({
      "grounding:v1": {
        text: "STALE",
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000
      }
    });
    const assets = fakeAssets({"/llms.txt": null, "/blog/llms-full.txt": null});
    expect(await getGrounding(storage, assets)).toBe("STALE");
  });
});
