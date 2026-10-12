import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { assert, beforeEach, describe, expect, it } from "vitest";

import { SITE_ORIGIN } from "@murugappan/content/site.ts";
import { VISITOR_COUNTRY_HEADER, VISITOR_IP_HEADER } from "#src/modules/chat/visitor.ts";
import worker from "#src/server.ts";
import {
  BLOG_NOT_FOUND_HTML,
  connectRoom,
  fakeFetcher,
  fetchWorker,
  NOT_FOUND_HTML,
  roomName,
  testEnv,
  visitorStorage
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
  it("is the only agent route: no other Durable Object, sub-path or room name upgrades", async () => {
    const upgrade = (path: string) =>
      fetchWorker(path, { headers: { Upgrade: "websocket", Origin: SITE_ORIGIN } }).then(
        r => r.status
      );
    expect(await upgrade("/agents/chat-room/V1StGXR8_Z5jdHi6B-myT")).toBe(101);
    expect(await upgrade("/agents/rate-limiter/global")).toBe(404);
    expect(await upgrade("/agents/chat-room/V1StGXR8_Z5jdHi6B-myT/sub/chat-room/other")).toBe(404);
    expect((await fetchWorker("/agents/chat-room/V1StGXR8_Z5jdHi6B-myT")).status).toBe(404);
    // The widget mints 21 characters of A-Za-z0-9_-.
    expect(await upgrade("/agents/chat-room/short")).toBe(404);
    expect(await upgrade(`/agents/chat-room/${"a".repeat(22)}`)).toBe(404);
    expect(await upgrade("/agents/chat-room/V1StGXR8_Z5jdHi6B.myT")).toBe(404);
    expect((await fetchWorker("/agents/chat-room/short/get-messages")).status).toBe(404);
  });

  it.each([
    { from: "the site's own page", site: SITE_ORIGIN, origin: SITE_ORIGIN, status: 101 },
    {
      from: "a local dev page on another port",
      site: "http://localhost:8787",
      origin: "http://localhost:4399",
      status: 101
    },
    { from: "another site", site: SITE_ORIGIN, origin: "https://evil.example", status: 403 },
    {
      from: "a local page against production",
      site: SITE_ORIGIN,
      origin: "http://localhost:4399",
      status: 403
    },
    { from: "a client that sends no Origin", site: SITE_ORIGIN, origin: undefined, status: 403 },
    {
      from: "a lookalike host",
      site: SITE_ORIGIN,
      origin: "https://murugappan.dev.evil.example",
      status: 403
    },
    { from: "the site over http", site: SITE_ORIGIN, origin: "http://murugappan.dev", status: 403 },
    {
      from: "another site in local dev",
      site: "http://localhost:8787",
      origin: "https://evil.example",
      status: 403
    }
  ])("upgrades a socket from $from with $status", async ({ site, origin, status }) => {
    const headers = new Headers({ Upgrade: "websocket" });
    if (origin) headers.set("Origin", origin);
    const res = await fetchWorker(`${site}/agents/chat-room/V1StGXR8_Z5jdHi6B-myT`, { headers });
    expect(res.status).toBe(status);
  });

  it("replaces client-supplied visitor headers with what Cloudflare reports", async () => {
    const { stub } = await connectRoom(roomName("spoof-room-ws"), {
      headers: {
        "CF-IPCountry": "IN",
        [VISITOR_COUNTRY_HEADER]: "XX",
        [VISITOR_IP_HEADER]: "203.0.113.66"
      }
    });
    const stored = await runInDurableObject(stub, visitorStorage);
    expect(stored.visitor_country).toBe("IN");
    // Cloudflare sent no IP, so the forged one must not survive either.
    expect(stored.visitor_ip).toBeUndefined();
  });
});

describe("asset requests", () => {
  it("passes a hit through untouched", async () => {
    const res = await fetchWorker("/llms.txt", { env: { assets: { "/llms.txt": "# Summary\n" } } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("# Summary\n");
  });

  it.each([
    [null, "text/markdown"],
    // curl and the fetch default send */*.
    ["*/*", "text/markdown"],
    ["text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "text/html"],
    ["application/xhtml+xml", "text/html"],
    ["text/markdown, text/html;q=0.5", "text/markdown"],
    ["text/markdown;q=0.5, text/html", "text/html"],
    // Equal q: header order decides.
    ["text/html, text/markdown", "text/html"],
    ["text/html;q=0", "text/markdown"],
    // The any-type range ranks markdown too, above the lower q HTML has here.
    ["text/html;q=0.5, */*", "text/markdown"],
    ["TEXT/MARKDOWN", "text/markdown"],
    ["application/json", "text/markdown"],
    ["text/plain", "text/markdown"]
  ])("answers Accept: %s with %s", async (accept, type) => {
    const res = await fetchWorker("/nope", accept === null ? {} : { headers: { Accept: accept } });
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(new RegExp(`^${type}`));
  });

  it("serves the styled page to a browser, and declares the negotiation", async () => {
    const res = await fetchWorker("/nope", {
      headers: { Accept: "text/html,application/xhtml+xml" }
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
    expect(res.headers.get("Vary")).toBe("Accept");
    expect(res.headers.get("Link")).toContain('rel="service-desc"');
    expect(await res.text()).toBe(NOT_FOUND_HTML);
  });

  it("serves the whole styled page to a browser revalidating a cached copy of it", async () => {
    const res = await fetchWorker("/nope", {
      headers: { Accept: "text/html", "If-None-Match": '"/404"' }
    });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(NOT_FOUND_HTML);
  });

  it("falls back to markdown when the build has no 404 page", async () => {
    const res = await fetchWorker("/nope", {
      headers: { Accept: "text/html" },
      env: { assets: { "/404": null } }
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/markdown/);
    expect(await res.text()).toContain("# 404 Not Found");
  });

  it("sends the page's headers but no body for a HEAD", async () => {
    const res = await fetchWorker("/nope", { method: "HEAD", headers: { Accept: "text/html" } });
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
    expect(await res.text()).toBe("");
  });
});

describe("pages", () => {
  const SITE = {
    "/": "<!doctype html><h1>Home</h1>",
    "/index.md": "# Home\n",
    "/about/": "<!doctype html><h1>About</h1>",
    "/about/index.md": "# About\n",
    "/developers/": "<!doctype html><h1>Developers</h1>"
  };
  const MARKDOWN = "text/markdown; charset=utf-8";
  const HTML = "text/html; charset=utf-8";

  async function page(path: string, init: RequestInit = {}) {
    const res = await fetchWorker(path, { ...init, env: { assets: SITE } });
    return {
      status: res.status,
      type: res.headers.get("Content-Type"),
      vary: res.headers.get("Vary"),
      body: await res.text()
    };
  }

  it.each([
    ["text/markdown", MARKDOWN, "# About\n"],
    ["text/markdown, text/html;q=0.5", MARKDOWN, "# About\n"],
    ["text/markdown;q=0.5, text/html", HTML, "<!doctype html><h1>About</h1>"],
    // Equal q: header order decides.
    ["text/html, text/markdown", HTML, "<!doctype html><h1>About</h1>"],
    ["text/markdown;q=0, */*", HTML, "<!doctype html><h1>About</h1>"],
    // A type takes the q of the most specific range that matches it.
    ["text/markdown;q=0.5, */*", HTML, "<!doctype html><h1>About</h1>"],
    ["text/html;q=0, text/*", MARKDOWN, "# About\n"],
    ["text/*;q=0.9, text/markdown;q=0.8, text/html;q=0.1", MARKDOWN, "# About\n"],
    ["*/*", HTML, "<!doctype html><h1>About</h1>"],
    ["text/*", HTML, "<!doctype html><h1>About</h1>"],
    [null, HTML, "<!doctype html><h1>About</h1>"],
    // What Claude Code sends.
    ["text/markdown, text/html, */*", MARKDOWN, "# About\n"],
    [
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      HTML,
      "<!doctype html><h1>About</h1>"
    ]
  ])("answers /about/ with Accept: %s as %s", async (accept, type, body) => {
    const headers: HeadersInit = accept === null ? {} : { Accept: accept };
    expect(await page("/about/", { headers })).toEqual({ status: 200, type, vary: "Accept", body });
  });

  it("serves the root page's rendition from /index.md", async () => {
    expect(await page("/", { headers: { Accept: "text/markdown" } })).toEqual({
      status: 200,
      type: MARKDOWN,
      vary: "Accept",
      body: "# Home\n"
    });
  });

  it("serves the HTML page to a markdown client when the page has no rendition", async () => {
    expect(await page("/developers/", { headers: { Accept: "text/markdown" } })).toEqual({
      status: 200,
      type: HTML,
      vary: "Accept",
      body: "<!doctype html><h1>Developers</h1>"
    });
  });

  it("names the rendition in a Link header only on an HTML page that has one", async () => {
    const link = async (path: string) =>
      (
        await fetchWorker(path, { headers: { Accept: "text/html" }, env: { assets: SITE } })
      ).headers.get("Link");
    expect({
      about: await link("/about/"),
      home: await link("/"),
      developers: await link("/developers/")
    }).toEqual({
      about: '</about/index.md>; rel="alternate"; type="text/markdown"',
      home: '</index.md>; rel="alternate"; type="text/markdown"',
      developers: null
    });
    // The 404 keeps its own Link header, without an alternate.
    expect((await link("/no-such-page/"))?.includes("index.md")).toBe(false);
  });

  it("revalidates the rendition against its own ETag", async () => {
    const res = await fetchWorker("/about/", {
      headers: { Accept: "text/markdown", "If-None-Match": '"/about/index.md"' },
      env: { assets: SITE }
    });
    expect({ status: res.status, type: res.headers.get("Content-Type") }).toEqual({
      status: 304,
      type: MARKDOWN
    });
  });

  it("sends the rendition's headers but no body for a HEAD", async () => {
    expect(await page("/about/", { method: "HEAD", headers: { Accept: "text/markdown" } })).toEqual(
      { status: 200, type: MARKDOWN, vary: "Accept", body: "" }
    );
  });

  it.each([
    ["text/markdown", MARKDOWN, "# 404 Not Found"],
    // The blog's own 404 page, not the site's.
    ["text/html", HTML, BLOG_NOT_FOUND_HTML]
  ])("answers a missing page with Accept: %s as a %s 404", async (accept, type, start) => {
    const res = await page("/blog/no-such-post/", { headers: { Accept: accept } });
    expect({ ...res, body: res.body.slice(0, start.length) }).toEqual({
      status: 404,
      type,
      vary: "Accept",
      body: start
    });
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
