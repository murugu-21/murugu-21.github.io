import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { ChatRoom } from "../chat-room";
import { VISITOR_COUNTRY_HEADER, VISITOR_IP_HEADER } from "../protocol";
import worker from "../server";

// The test wrangler config has no ASSETS binding, so each test injects a mock
// that marks its responses — proving whether a request fell through to assets
// or was claimed by the party route.
function envWithAssets(onFetch?: (request: Request) => void): Env {
  return {
    ...env,
    ASSETS: {
      fetch: (input: RequestInfo | URL) => {
        onFetch?.(new Request(input));
        return Promise.resolve(new Response("asset", { status: 200 }));
      }
    }
  } as unknown as Env;
}

describe("worker entry", () => {
  it("falls through to static assets for non-party requests", async () => {
    const seen: Request[] = [];
    const response = await worker.fetch(
      new Request("https://example.com/blog/some-post"),
      envWithAssets(r => seen.push(r))
    );
    expect(await response.text()).toBe("asset");
    expect(seen).toHaveLength(1);
    expect(new URL(seen[0].url).pathname).toBe("/blog/some-post");
  });

  it("routes /parties/chat-room/:room to the Durable Object, not assets", async () => {
    let assetHits = 0;
    const response = await worker.fetch(
      new Request("https://example.com/parties/chat-room/test-room"),
      envWithAssets(() => assetHits++)
    );
    // A plain HTTP GET on a WebSocket-only party is not an asset fallthrough:
    // partyserver answers it itself (404 Not Found by default).
    expect(assetHits).toBe(0);
    expect(await response.text()).not.toBe("asset");
  });

  it("claims /api/* itself so failures are JSON, not the HTML 404 page", async () => {
    let assetHits = 0;
    const response = await worker.fetch(
      new Request("https://example.com/api/nope"),
      envWithAssets(() => assetHits++)
    );
    expect(assetHits).toBe(0);
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toMatch(/^application\/json/);
  });

  it("claims /openapi.json itself rather than serving it as an asset", async () => {
    let assetHits = 0;
    const response = await worker.fetch(
      new Request("https://example.com/openapi.json"),
      envWithAssets(() => assetHits++)
    );
    expect(assetHits).toBe(0);
    expect(((await response.json()) as { openapi: string }).openapi).toBe("3.1.0");
  });

  it("claims /mcp itself so the MCP endpoint is not a static 404", async () => {
    let assetHits = 0;
    const response = await worker.fetch(
      new Request("https://example.com/mcp", { method: "GET" }),
      envWithAssets(() => assetHits++)
    );
    expect(assetHits).toBe(0);
    // This revision of Streamable HTTP defines POST only.
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST, OPTIONS");
  });

  it("claims the versioned API prefix itself", async () => {
    let assetHits = 0;
    const response = await worker.fetch(
      new Request("https://example.com/api/v1/nope"),
      envWithAssets(() => assetHits++)
    );
    expect(assetHits).toBe(0);
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toMatch(/^application\/json/);
  });

  it("claims the discovery documents rather than serving them as assets", async () => {
    for (const path of ["/.well-known/api-catalog", "/.well-known/mcp.json", "/mcp.json"]) {
      let assetHits = 0;
      const response = await worker.fetch(
        new Request(`https://example.com${path}`),
        envWithAssets(() => assetHits++)
      );
      expect(assetHits, path).toBe(0);
      expect(response.status, path).toBe(200);
    }
  });

  it("upgrades WebSocket connections on the party route", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/parties/chat-room/test-room-ws", {
        headers: { Upgrade: "websocket" }
      }),
      envWithAssets()
    );
    expect(response.status).toBe(101);
    expect(response.webSocket).not.toBeNull();
    response.webSocket?.accept();
    response.webSocket?.close();
  });

  it("passes the visitor's country and IP to the room on upgrade", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/parties/chat-room/geo-room-ws", {
        headers: {
          Upgrade: "websocket",
          "CF-Connecting-IP": "198.51.100.42",
          "CF-IPCountry": "IN"
        }
      }),
      envWithAssets()
    );
    expect(response.status).toBe(101);
    response.webSocket?.accept();
    response.webSocket?.close();

    const stub = env.ChatRoom.get(env.ChatRoom.idFromName("geo-room-ws"));
    await runInDurableObject(stub, async (instance: ChatRoom) => {
      const meta = Object.fromEntries(
        instance.ctx.storage.sql
          .exec(`SELECT key, value FROM meta WHERE key LIKE 'visitor_%'`)
          .toArray()
          .map(r => [r.key as string, r.value])
      );
      expect(meta.visitor_country).toBe("IN");
      expect(meta.visitor_ip).toBe("198.51.100.42");
    });
  });

  it("drops a client-supplied visitor header when Cloudflare knows nothing", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/parties/chat-room/spoof-room-ws", {
        headers: {
          Upgrade: "websocket",
          [VISITOR_COUNTRY_HEADER]: "XX",
          [VISITOR_IP_HEADER]: "203.0.113.66"
        }
      }),
      envWithAssets()
    );
    expect(response.status).toBe(101);
    response.webSocket?.accept();
    response.webSocket?.close();

    const stub = env.ChatRoom.get(env.ChatRoom.idFromName("spoof-room-ws"));
    await runInDurableObject(stub, async (instance: ChatRoom) => {
      const rows = instance.ctx.storage.sql
        .exec(`SELECT key FROM meta WHERE key LIKE 'visitor_%'`)
        .toArray();
      expect(rows).toEqual([]);
    });
  });
});
