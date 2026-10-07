// The worker entry: which requests it claims, which fall through to static
// assets, and how a miss is answered.
import { env, runInDurableObject } from "cloudflare:test";
import { assert, beforeEach, describe, expect, it } from "vitest";

import { parseRange } from "#worker/audio.ts";
import { ChatRoom } from "#worker/chat-room.ts";
import { markdownNotFound, prefersMarkdown, serveAsset } from "#worker/not-found.ts";
import { VISITOR_COUNTRY_HEADER, VISITOR_IP_HEADER } from "#worker/visitor.ts";
import worker from "#worker/server.ts";
import {
  BLOG_NOT_FOUND_HTML,
  connectRoom,
  fakeAssets,
  fakeFetcher,
  fetchWorker,
  LLMS_TXT,
  NOT_FOUND_HTML,
  testEnv,
  visitorMeta
} from "./fixtures";

// Every response from this ASSETS stub is marked, proving whether a request
// fell through to assets or was claimed by the worker.
function envWithAssets(onFetch: (request: Request) => void): Env {
  return {
    ...testEnv(),
    ASSETS: fakeFetcher(input => {
      onFetch(new Request(input));
      return Promise.resolve(new Response("asset", { status: 200 }));
    })
  };
}

describe("routing", () => {
  it("falls through to static assets for a request it does not claim", async () => {
    const seen: Request[] = [];
    const response = await worker.fetch(
      new Request("https://example.com/blog/some-post"),
      envWithAssets(r => seen.push(r))
    );
    expect(await response.text()).toBe("asset");
    expect(seen.map(r => new URL(r.url).pathname)).toEqual(["/blog/some-post"]);
  });

  // /mcp is 405 because this revision of Streamable HTTP defines POST only.
  it.each([
    ["/api/nope", 404],
    ["/api/v1/nope", 404],
    ["/openapi.json", 200],
    ["/mcp", 405],
    ["/.well-known/api-catalog", 200],
    ["/.well-known/mcp.json", 200],
    ["/mcp.json", 200]
  ])("claims %s itself rather than serving an asset", async (path, status) => {
    let assetHits = 0;
    const response = await worker.fetch(
      new Request(`https://example.com${path}`),
      envWithAssets(() => assetHits++)
    );
    expect(assetHits).toBe(0);
    expect(response.status).toBe(status);
  });
});

describe("the chat-room WebSocket", () => {
  it("is the only agent route: no other Durable Object or sub-path upgrades", async () => {
    const upgrade = (path: string) =>
      fetchWorker(path, { headers: { Upgrade: "websocket" } }).then(r => r.status);
    expect(await upgrade("/agents/chat-room/route-room")).toBe(101);
    expect(await upgrade("/agents/rate-limiter/global")).toBe(404);
    expect(await upgrade("/agents/chat-room/route-room/sub/chat-room/other")).toBe(404);
    expect((await fetchWorker("/agents/chat-room/route-room")).status).toBe(404);
  });

  it("replaces client-supplied visitor headers with what Cloudflare reports", async () => {
    const { stub } = await connectRoom("spoof-room-ws", {
      "CF-IPCountry": "IN",
      [VISITOR_COUNTRY_HEADER]: "XX",
      [VISITOR_IP_HEADER]: "203.0.113.66"
    });
    const meta = await runInDurableObject(stub, async (instance: ChatRoom) =>
      visitorMeta(instance)
    );
    expect(meta.visitor_country).toBe("IN");
    // Cloudflare sent no IP, so the forged one must not survive either.
    expect(meta.visitor_ip).toBeUndefined();
  });
});

describe("prefersMarkdown", () => {
  it.each([
    [null, true],
    // curl and the fetch default send */*.
    ["*/*", true],
    ["text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", false],
    ["application/xhtml+xml", false],
    ["text/markdown, text/html;q=0.5", true],
    ["TEXT/MARKDOWN", true],
    ["application/json", true],
    ["text/plain", true]
  ])("answers Accept: %s with markdown: %s", (accept, expected) => {
    expect(prefersMarkdown(accept)).toBe(expected);
  });
});

describe("markdownNotFound", () => {
  it("is an unindexed, uncached 404 that declares the negotiation", async () => {
    const res = markdownNotFound("/nope", "GET");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("Vary")).toBe("Accept");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const link = res.headers.get("Link") ?? "";
    expect(link).toContain('rel="service-desc"');
    expect(link).toContain('rel="api-catalog"');
    expect(link).toContain("/sitemap.xml");
    const body = await res.text();
    expect(body.startsWith("# 404 Not Found")).toBe(true);
    expect(body).toContain("`/nope`");
  });

  it("sends no body for a HEAD", async () => {
    const res = markdownNotFound("/nope", "HEAD");
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });
});

describe("serveAsset", () => {
  const serve = (path: string, init?: RequestInit) =>
    serveAsset(new Request(`https://murugappan.dev${path}`, init), fakeAssets());

  it("passes a hit through untouched", async () => {
    const res = await serve("/llms.txt");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(LLMS_TXT);
  });

  it("answers a miss with markdown for a machine client", async () => {
    const res = await serve("/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/markdown/);
  });

  it("serves the styled page to a browser, and declares the negotiation", async () => {
    const res = await serve("/nope", {
      headers: { Accept: "text/html,application/xhtml+xml" }
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
    expect(res.headers.get("Vary")).toBe("Accept");
    expect(res.headers.get("Link")).toContain('rel="service-desc"');
    expect(await res.text()).toBe(NOT_FOUND_HTML);
  });

  it("serves the blog's own 404 page for a miss under /blog/", async () => {
    const res = await serve("/blog/no-such-post/", { headers: { Accept: "text/html" } });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(BLOG_NOT_FOUND_HTML);
  });

  it("falls back to markdown when the build has no 404 page", async () => {
    const res = await serveAsset(
      new Request("https://murugappan.dev/nope", { headers: { Accept: "text/html" } }),
      fakeAssets({ "/404": null })
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/markdown/);
    expect(await res.text()).toContain("# 404 Not Found");
  });

  it("sends the page's headers but no body for a HEAD", async () => {
    const res = await serve("/nope", { method: "HEAD", headers: { Accept: "text/html" } });
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
    expect(await res.text()).toBe("");
  });
});

describe("GET /blog/audio/:file", () => {
  const MP3 = new Uint8Array(1000).map((_, i) => i % 251);
  const JSON_BODY = JSON.stringify({
    version: 1,
    slug: "first-post",
    blocks: []
  });

  beforeEach(async () => {
    await env.AUDIO.put("blog/breeze/first-post.mp3", MP3, {
      httpMetadata: { contentType: "audio/mpeg" }
    });
    await env.AUDIO.put("blog/breeze/first-post.json", JSON_BODY, {
      httpMetadata: { contentType: "application/json" }
    });
  });

  it("serves the mp3 with content type, etag and cache headers", async () => {
    const res = await fetchWorker("/blog/audio/first-post.mp3");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(res.headers.get("ETag")).toMatch(/^(W\/)?".+"$/);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(MP3);
  });

  it("serves the timing json", async () => {
    const res = await fetchWorker("/blog/audio/first-post.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual(JSON.parse(JSON_BODY));
  });

  it("honours a byte range", async () => {
    const res = await fetchWorker("/blog/audio/first-post.mp3", {
      headers: { Range: "bytes=100-199" }
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 100-199/1000");
    expect(res.headers.get("Content-Length")).toBe("100");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(MP3.slice(100, 200));
  });

  it("rejects an unsatisfiable range", async () => {
    const res = await fetchWorker("/blog/audio/first-post.mp3", {
      headers: { Range: "bytes=5000-6000" }
    });
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */1000");
  });

  it("answers 304 to an exact, weak, listed or wildcard If-None-Match, and 200 to another tag", async () => {
    const first = await fetchWorker("/blog/audio/first-post.mp3");
    const etag = first.headers.get("ETag");
    assert(etag, "first response has no ETag");
    const status = async (ifNoneMatch: string) =>
      (
        await fetchWorker("/blog/audio/first-post.mp3", {
          headers: { "If-None-Match": ifNoneMatch }
        })
      ).status;
    expect(await status(etag)).toBe(304);
    expect(await status(`W/${etag}`)).toBe(304);
    expect(await status(`"other", ${etag}`)).toBe(304);
    expect(await status("*")).toBe(304);
    expect(await status('"other"')).toBe(200);
  });

  it.each(["/blog/audio/nope.mp3", "/blog/audio/..%2Fsecret.mp3", "/blog/audio/first-post.wav"])(
    "falls through to the negotiated 404 for %s",
    async path => {
      const res = await fetchWorker(path);
      expect(res.status).toBe(404);
      expect(res.headers.get("Content-Type")).toContain("text/markdown");
    }
  );
});

describe("parseRange", () => {
  it.each([
    ["bytes=0-9", { offset: 0, length: 10 }],
    ["bytes=90-", { offset: 90, length: 10 }],
    ["bytes=-5", { offset: 95, length: 5 }],
    // An end past the object is clamped to it.
    ["bytes=95-500", { offset: 95, length: 5 }],
    ["bytes=100-", "unsatisfiable"],
    ["bytes=-0", "unsatisfiable"],
    ["bytes=50-20", "unsatisfiable"],
    // A suffix longer than the object is the whole object.
    ["bytes=-500", { offset: 0, length: 100 }],
    ["bytes=-", null],
    ["items=0-1", null],
    [null, null]
  ])("parses %s against a 100-byte object", (header, expected) => {
    expect(parseRange(header, 100)).toEqual(expected);
  });
});
