import {beforeEach, describe, expect, it} from "vitest";

import {parseRange} from "../audio";
import worker from "../server";
import {fakeAssets} from "./fixtures";
import {env} from "cloudflare:test";

const testEnv = (): Env => ({...env, ASSETS: fakeAssets()}) as unknown as Env;

const fetchPath = (path: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://murugappan.dev${path}`, init), testEnv());

const MP3 = new Uint8Array(1000).map((_, i) => i % 251);
const JSON_BODY = JSON.stringify({version: 1, slug: "first-post", blocks: []});

beforeEach(async () => {
  await env.AUDIO.put("blog/first-post.mp3", MP3, {
    httpMetadata: {contentType: "audio/mpeg"}
  });
  await env.AUDIO.put("blog/first-post.json", JSON_BODY, {
    httpMetadata: {contentType: "application/json"}
  });
});

describe("GET /blog/audio/:file", () => {
  it("serves the mp3 with content type, etag and cache headers", async () => {
    const res = await fetchPath("/blog/audio/first-post.mp3");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(res.headers.get("ETag")).toMatch(/^(W\/)?".+"$/);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(MP3);
  });

  it("serves the timing json", async () => {
    const res = await fetchPath("/blog/audio/first-post.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual(JSON.parse(JSON_BODY));
  });

  it("honours a byte range", async () => {
    const res = await fetchPath("/blog/audio/first-post.mp3", {
      headers: {Range: "bytes=100-199"}
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 100-199/1000");
    expect(res.headers.get("Content-Length")).toBe("100");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      MP3.slice(100, 200)
    );
  });

  it("honours an open-ended range", async () => {
    const res = await fetchPath("/blog/audio/first-post.mp3", {
      headers: {Range: "bytes=900-"}
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 900-999/1000");
  });

  it("rejects an unsatisfiable range", async () => {
    const res = await fetchPath("/blog/audio/first-post.mp3", {
      headers: {Range: "bytes=5000-6000"}
    });
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */1000");
  });

  it("answers 304 to a matching If-None-Match", async () => {
    const first = await fetchPath("/blog/audio/first-post.mp3");
    const etag = first.headers.get("ETag")!;
    const res = await fetchPath("/blog/audio/first-post.mp3", {
      headers: {"If-None-Match": etag}
    });
    expect(res.status).toBe(304);
  });

  it("falls through to the negotiated 404 for a missing object", async () => {
    const res = await fetchPath("/blog/audio/nope.mp3");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
  });

  it("falls through to the negotiated 404 for a malformed name", async () => {
    const res = await fetchPath("/blog/audio/..%2Fsecret.mp3");
    expect(res.status).toBe(404);
    const other = await fetchPath("/blog/audio/first-post.wav");
    expect(other.status).toBe(404);
  });
});

describe("parseRange", () => {
  it("parses closed, open and suffix ranges", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual({offset: 0, length: 10});
    expect(parseRange("bytes=90-", 100)).toEqual({offset: 90, length: 10});
    expect(parseRange("bytes=-5", 100)).toEqual({offset: 95, length: 5});
  });

  it("clamps an end past the object", () => {
    expect(parseRange("bytes=95-500", 100)).toEqual({offset: 95, length: 5});
  });

  it("flags ranges beyond the object and ignores garbage", () => {
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 100)).toBe("unsatisfiable");
    expect(parseRange("items=0-1", 100)).toBeNull();
    expect(parseRange(null, 100)).toBeNull();
  });
});
