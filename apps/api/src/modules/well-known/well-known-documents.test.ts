import { describe, expect, it } from "vite-plus/test";

import { buildApiCatalog, buildMcpManifest } from "#src/modules/well-known/well-known-documents.ts";

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
