import { describe, expect, it } from "vitest";
import { z } from "zod";

import { buildApiCatalog, buildMcpManifest } from "#src/well-known.ts";
import { fetchWorker, readJson } from "./fixtures";

describe("buildApiCatalog", () => {
  const catalog = buildApiCatalog("https://murugappan.dev");

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
    expect(own.tools).toEqual([
      "get_profile",
      "list_experience",
      "list_skills",
      "list_education",
      "list_open_source",
      "search_blog_posts",
      "get_blog_post",
      "send_message"
    ]);
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
