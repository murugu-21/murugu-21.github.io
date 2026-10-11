import { describe, expect, it } from "vitest";

import { markdownNotFound } from "#src/modules/pages/not-found.ts";

describe("markdownNotFound", () => {
  it("is an unindexed, uncached 404 that declares the negotiation", async () => {
    const res = markdownNotFound({ pathname: "/nope", method: "GET" });
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
    const res = markdownNotFound({ pathname: "/nope", method: "HEAD" });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });
});
