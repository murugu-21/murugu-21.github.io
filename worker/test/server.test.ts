import {env} from "cloudflare:test";
import {describe, expect, it} from "vitest";

import worker, {ChatRoom, RateLimiter} from "../server";

// The test wrangler config has no ASSETS binding, so each test injects a mock
// that marks its responses — proving whether a request fell through to assets
// or was claimed by the party route.
function envWithAssets(onFetch?: (request: Request) => void): Env {
  return {
    ...env,
    ASSETS: {
      fetch: (input: RequestInfo | URL) => {
        onFetch?.(new Request(input));
        return Promise.resolve(new Response("asset", {status: 200}));
      }
    }
  } as unknown as Env;
}

describe("worker entry", () => {
  it("exports a fetch handler and both Durable Object classes", () => {
    expect(typeof worker.fetch).toBe("function");
    expect(typeof ChatRoom).toBe("function");
    expect(typeof RateLimiter).toBe("function");
  });

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

  it("upgrades WebSocket connections on the party route", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/parties/chat-room/test-room-ws", {
        headers: {Upgrade: "websocket"}
      }),
      envWithAssets()
    );
    expect(response.status).toBe(101);
    expect(response.webSocket).not.toBeNull();
    response.webSocket?.accept();
    response.webSocket?.close();
  });
});
