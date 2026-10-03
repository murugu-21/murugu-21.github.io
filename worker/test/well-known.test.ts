import { describe, expect, it } from "vitest";

import { VERSIONED_API_BASE } from "../api/routes";
import { MCP_TOOLS } from "../mcp/tools";
import worker from "../server";
import {
  buildApiCatalog,
  buildMcpManifest,
  LINKSET_MEDIA_TYPE,
  MCP_SERVER_NAME
} from "../well-known";
import { testEnv } from "./fixtures";

const get = (path: string, origin = "https://murugappan.dev") =>
  worker.fetch(new Request(`${origin}${path}`), testEnv());

describe("buildApiCatalog", () => {
  const catalog = buildApiCatalog("https://murugappan.dev");

  it("is a linkset that anchors each entry at the API's own base URL", () => {
    expect(catalog.linkset.map(e => e.anchor)).toEqual([
      `https://murugappan.dev${VERSIONED_API_BASE}`,
      "https://murugappan.dev/mcp"
    ]);
  });

  // RFC 9727 requires at least one of service-desc / service-doc per entry.
  it("gives every entry a description and human documentation", () => {
    for (const entry of catalog.linkset) {
      const desc = entry["service-desc"] ?? [];
      const doc = entry["service-doc"] ?? [];
      expect(desc.length, entry.anchor).toBeGreaterThan(0);
      expect(doc.length, entry.anchor).toBeGreaterThan(0);
      for (const target of [...desc, ...doc]) {
        expect(target.href.startsWith("https://murugappan.dev")).toBe(true);
      }
    }
  });

  it("names the product in every service link title, so a name search finds it", () => {
    // `author` names the person; every other relation names the product.
    for (const { anchor: _anchor, author: _author, ...relations } of catalog.linkset) {
      for (const [relation, targets] of Object.entries(relations)) {
        for (const target of targets ?? []) {
          expect(target.title, relation).toContain("murugappan.dev");
        }
      }
    }
  });
});

describe("buildMcpManifest", () => {
  const manifest = buildMcpManifest("https://murugappan.dev");

  it("names the server in the reverse-DNS form the schema requires", () => {
    expect(manifest.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
  });

  it("keeps the description inside the schema's 100-character limit", () => {
    expect(manifest.description.length).toBeGreaterThan(0);
    expect(manifest.description.length).toBeLessThanOrEqual(100);
  });

  it("puts everything beyond the schema under a reverse-DNS _meta key", () => {
    expect(Object.keys(manifest._meta)).toEqual(["dev.murugappan/server"]);
    const own = manifest._meta["dev.murugappan/server"];
    expect(own.transport).toBe("streamable-http");
    expect(own.authentication).toBe("none");
    expect(own.tools).toEqual(MCP_TOOLS.map(t => t.name));
  });

  it("uses only the fields the schema defines at the top level", () => {
    expect(Object.keys(manifest).sort()).toEqual([
      "$schema",
      "_meta",
      "description",
      "name",
      "remotes",
      "repository",
      "version",
      "websiteUrl"
    ]);
  });
});

describe("/.well-known/api-catalog", () => {
  it("is served cross-origin with the RFC 9727 media type", async () => {
    const res = await get("/.well-known/api-catalog");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(`${LINKSET_MEDIA_TYPE}; charset=utf-8`);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("names the host that answered", async () => {
    const res = await get("/.well-known/api-catalog", "https://preview.example");
    const body = await res.json<{ linkset: Array<{ anchor: string }> }>();
    expect(body.linkset[0].anchor).toBe(`https://preview.example${VERSIONED_API_BASE}`);
  });
});

describe("the MCP manifest endpoint", () => {
  // /mcp.json must not be mistaken for a JSON-RPC call to /mcp.
  it.each(["/.well-known/mcp.json", "/mcp.json"])("is served at %s", async path => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
    expect((await res.json<{ name: string }>()).name).toBe(MCP_SERVER_NAME);
  });

  it("names the host that answered", async () => {
    const res = await get("/mcp.json", "https://preview.example");
    const body = await res.json<{ remotes: Array<{ url: string }> }>();
    expect(body.remotes[0].url).toBe("https://preview.example/mcp");
  });

  it("404s an unknown well-known path as markdown, not as the HTML page", async () => {
    const res = await get("/.well-known/nope.json");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/markdown/);
  });
});
