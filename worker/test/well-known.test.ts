import {env} from "cloudflare:test";
import {describe, expect, it} from "vitest";

import {API_PATHS, VERSIONED_API_BASE} from "../api/routes";
import {API_VERSION} from "../api/versioning";
import {MCP_TOOLS} from "../mcp/tools";
import worker from "../server";
import {
  buildApiCatalog,
  buildMcpManifest,
  LINKSET_MEDIA_TYPE,
  MCP_SERVER_NAME,
  MCP_SERVER_SCHEMA
} from "../well-known";
import {fakeAssets} from "./fixtures";

const testEnv = (): Env => ({...env, ASSETS: fakeAssets()}) as unknown as Env;

const get = (path: string, origin = "https://murugappan.dev") =>
  worker.fetch(new Request(`${origin}${path}`), testEnv());

describe("buildApiCatalog", () => {
  const catalog = buildApiCatalog("https://murugappan.dev");

  it("is a linkset: one context object per API", () => {
    expect(Array.isArray(catalog.linkset)).toBe(true);
    expect(catalog.linkset).toHaveLength(2);
  });

  it("anchors each entry at the API's own base URL", () => {
    expect(catalog.linkset.map(e => e.anchor)).toEqual([
      `https://murugappan.dev${VERSIONED_API_BASE}`,
      "https://murugappan.dev/mcp"
    ]);
  });

  // RFC 9727 requires at least one of service-desc / service-doc per entry.
  it("gives every entry a description and human documentation", () => {
    for (const entry of catalog.linkset) {
      const desc = entry["service-desc"] as Array<{href: string}>;
      const doc = entry["service-doc"] as Array<{href: string}>;
      expect(desc?.length, String(entry.anchor)).toBeGreaterThan(0);
      expect(doc?.length, String(entry.anchor)).toBeGreaterThan(0);
      for (const target of [...desc, ...doc]) {
        expect(target.href.startsWith("https://murugappan.dev")).toBe(true);
      }
    }
  });

  it("names the product in every service link title, so a name search finds it", () => {
    for (const entry of catalog.linkset) {
      for (const [relation, targets] of Object.entries(entry)) {
        // `author` names the person; every other relation names the product.
        if (relation === "anchor" || relation === "author") continue;
        for (const target of targets as Array<{title?: string}>) {
          expect(target.title, relation).toContain("murugappan.dev");
        }
      }
    }
  });

  it("points the REST entry at the spec, the docs and the version policy", () => {
    const rest = catalog.linkset[0];
    expect((rest["service-desc"] as Array<{href: string}>)[0].href).toBe(
      "https://murugappan.dev/openapi.json"
    );
    expect((rest["service-doc"] as Array<{href: string}>)[0].href).toBe(
      "https://murugappan.dev/developers/"
    );
    expect((rest["service-meta"] as Array<{href: string}>)[0].href).toBe(
      `https://murugappan.dev${API_PATHS.versions}`
    );
  });

  it("points the MCP entry at its manifest", () => {
    const mcp = catalog.linkset[1];
    expect((mcp["service-desc"] as Array<{href: string}>)[0].href).toBe(
      "https://murugappan.dev/.well-known/mcp.json"
    );
  });
});

describe("buildMcpManifest", () => {
  const manifest = buildMcpManifest("https://murugappan.dev");

  it("declares the published server.json schema", () => {
    expect(manifest.$schema).toBe(MCP_SERVER_SCHEMA);
  });

  it("names the server in the reverse-DNS form the schema requires", () => {
    expect(manifest.name).toBe(MCP_SERVER_NAME);
    expect(manifest.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
  });

  it("keeps the description inside the schema's 100-character limit", () => {
    expect((manifest.description as string).length).toBeGreaterThan(0);
    expect((manifest.description as string).length).toBeLessThanOrEqual(100);
  });

  it("advertises Streamable HTTP as a remote, at the real endpoint", () => {
    expect(manifest.remotes).toEqual([
      {type: "streamable-http", url: "https://murugappan.dev/mcp"}
    ]);
  });

  it("carries the version and a link to the documentation", () => {
    expect(manifest.version).toBe(API_VERSION);
    expect(manifest.websiteUrl).toBe("https://murugappan.dev/developers/#mcp");
    expect(manifest.repository).toMatchObject({source: "github"});
  });

  it("puts everything beyond the schema under a reverse-DNS _meta key", () => {
    const meta = manifest._meta as Record<string, Record<string, unknown>>;
    expect(Object.keys(meta)).toEqual(["dev.murugappan/server"]);
    const own = meta["dev.murugappan/server"];
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
  it("is served with the RFC 9727 media type", async () => {
    const res = await get("/.well-known/api-catalog");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      `${LINKSET_MEDIA_TYPE}; charset=utf-8`
    );
  });

  it("names the host that answered", async () => {
    const res = await get(
      "/.well-known/api-catalog",
      "https://preview.example"
    );
    const body = (await res.json()) as {linkset: Array<{anchor: string}>};
    expect(body.linkset[0].anchor).toBe(
      `https://preview.example${VERSIONED_API_BASE}`
    );
  });

  it("is readable cross-origin", async () => {
    const res = await get("/.well-known/api-catalog");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("the MCP manifest endpoint", () => {
  it("is served at the well-known location", async () => {
    const res = await get("/.well-known/mcp.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
    expect(((await res.json()) as {name: string}).name).toBe(MCP_SERVER_NAME);
  });

  it("is served at /mcp.json too, without being mistaken for JSON-RPC", async () => {
    const res = await get("/mcp.json");
    expect(res.status).toBe(200);
    expect(((await res.json()) as {name: string}).name).toBe(MCP_SERVER_NAME);
  });

  it("names the host that answered", async () => {
    const res = await get("/mcp.json", "https://preview.example");
    const body = (await res.json()) as {remotes: Array<{url: string}>};
    expect(body.remotes[0].url).toBe("https://preview.example/mcp");
  });

  it("does not shadow the MCP endpoint itself", async () => {
    const res = await worker.fetch(
      new Request("https://murugappan.dev/mcp", {method: "GET"}),
      testEnv()
    );
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
  });

  it("404s an unknown well-known path as markdown, not as the HTML page", async () => {
    const res = await get("/.well-known/nope.json");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/markdown/);
  });
});
