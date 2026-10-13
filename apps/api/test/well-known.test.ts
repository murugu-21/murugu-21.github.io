import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { fetchWorker, readJson } from "./fixtures";

// Hono answers HEAD from the GET route.
describe("HEAD on the discovery documents", () => {
  it.each(["/.well-known/api-catalog", "/.well-known/mcp.json", "/mcp.json"])(
    "answers HEAD %s with GET's status and Content-Type and no body",
    async path => {
      const get = await fetchWorker(path);
      const head = await fetchWorker(path, { method: "HEAD" });
      expect(get.status).toBe(200);
      expect(head.status).toBe(200);
      expect(head.headers.get("Content-Type")).toBe(get.headers.get("Content-Type"));
      expect(await get.text()).toMatch(/^\{/);
      expect(await head.text()).toBe("");
    }
  );
});

describe("/.well-known/api-catalog", () => {
  it("is served cross-origin with the RFC 9727 media type", async () => {
    const res = await fetchWorker("/.well-known/api-catalog");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/linkset+json; charset=utf-8");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("anchors each entry at the answering host's API and MCP endpoints", async () => {
    const res = await fetchWorker("https://preview.example/.well-known/api-catalog");
    const body = await readJson(
      res,
      z.object({ linkset: z.array(z.object({ anchor: z.string() })) })
    );
    expect(body.linkset.map(e => e.anchor)).toEqual([
      "https://preview.example/api/v1",
      "https://preview.example/mcp"
    ]);
  });
});

describe("the MCP manifest endpoint", () => {
  // /mcp.json must not be mistaken for a JSON-RPC call to /mcp.
  it.each(["/.well-known/mcp.json", "/mcp.json"])("is served at %s", async path => {
    const res = await fetchWorker(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
    expect((await readJson(res, z.object({ name: z.string() }))).name).toBe(
      "dev.murugappan/murugappan-dev"
    );
  });

  it("names the host that answered", async () => {
    const res = await fetchWorker("https://preview.example/mcp.json");
    const body = await readJson(res, z.object({ remotes: z.array(z.object({ url: z.string() })) }));
    expect(body.remotes[0].url).toBe("https://preview.example/mcp");
  });

  it("404s an unknown well-known path as markdown, not as the HTML page", async () => {
    const res = await fetchWorker("/.well-known/nope.json");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/markdown/);
  });
});
