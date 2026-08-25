import {describe, expect, it} from "vitest";

import {
  markdownNotFound,
  notFoundMarkdown,
  prefersMarkdown,
  serveAsset
} from "../not-found";
import worker from "../server";
import {fakeAssets, LLMS_TXT, NOT_FOUND_HTML} from "./fixtures";
import {env} from "cloudflare:test";

const testEnv = (): Env => ({...env, ASSETS: fakeAssets()}) as unknown as Env;

const fetchPath = (path: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://murugappan.dev${path}`, init), testEnv());

describe("prefersMarkdown", () => {
  it("treats a missing Accept header as a machine client", () => {
    expect(prefersMarkdown(null)).toBe(true);
  });

  it("treats */* — curl and the fetch default — as a machine client", () => {
    expect(prefersMarkdown("*/*")).toBe(true);
  });

  it("gives a browser the HTML page", () => {
    expect(
      prefersMarkdown(
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      )
    ).toBe(false);
    expect(prefersMarkdown("application/xhtml+xml")).toBe(false);
  });

  it("honours an explicit markdown preference over an HTML one", () => {
    expect(prefersMarkdown("text/markdown, text/html;q=0.5")).toBe(true);
    expect(prefersMarkdown("TEXT/MARKDOWN")).toBe(true);
  });

  it("prefers markdown for any other machine media type", () => {
    expect(prefersMarkdown("application/json")).toBe(true);
    expect(prefersMarkdown("text/plain")).toBe(true);
  });
});

describe("notFoundMarkdown", () => {
  const body = notFoundMarkdown("/some-path-that-does-not-exist");

  it("opens with a heading a model can parse", () => {
    expect(body.startsWith("# 404 Not Found")).toBe(true);
  });

  it("names the path that was missed, and says not to retry it", () => {
    expect(body).toContain("`/some-path-that-does-not-exist`");
    expect(body).toContain("do not retry");
  });

  it("points at the sitemap and every machine-readable entry point", () => {
    for (const url of [
      "https://murugappan.dev/sitemap.xml",
      "https://murugappan.dev/llms.txt",
      "https://murugappan.dev/AGENTS.md",
      "https://murugappan.dev/developers/",
      "https://murugappan.dev/openapi.json",
      "https://murugappan.dev/.well-known/api-catalog",
      "https://murugappan.dev/.well-known/mcp.json",
      "https://murugappan.dev/mcp"
    ]) {
      expect(body).toContain(url);
    }
  });

  it("points at the pages that do exist", () => {
    expect(body).toContain("https://murugappan.dev/about/");
    expect(body).toContain("https://murugappan.dev/blog/");
    expect(body).toContain("https://murugappan.dev/resume/");
  });

  it("names the cheapest API call to make instead", () => {
    expect(body).toContain("https://murugappan.dev/api/v1/profile");
  });
});

describe("markdownNotFound", () => {
  it("is a real 404 with a markdown body", async () => {
    const res = markdownNotFound("/nope", "GET");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toBe(
      "text/markdown; charset=utf-8"
    );
    expect(await res.text()).toContain("# 404 Not Found");
  });

  it("declares the negotiation and keeps itself out of the index", () => {
    const res = markdownNotFound("/nope", "GET");
    expect(res.headers.get("Vary")).toBe("Accept");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("carries the discovery Link relations", () => {
    const link = markdownNotFound("/nope", "GET").headers.get("Link") ?? "";
    expect(link).toContain('rel="service-desc"');
    expect(link).toContain('rel="service-doc"');
    expect(link).toContain('rel="api-catalog"');
    expect(link).toContain("/sitemap.xml");
  });

  it("sends no body for a HEAD", async () => {
    const res = markdownNotFound("/nope", "HEAD");
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });
});

describe("serveAsset", () => {
  it("passes a hit through untouched", async () => {
    const res = await serveAsset(
      new Request("https://murugappan.dev/llms.txt"),
      fakeAssets() as never
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(LLMS_TXT);
  });

  it("replaces the HTML 404 page with markdown for a machine client", async () => {
    const res = await serveAsset(
      new Request("https://murugappan.dev/nope"),
      fakeAssets() as never
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/markdown/);
  });

  it("serves the styled page to a browser, and declares the negotiation", async () => {
    const res = await serveAsset(
      new Request("https://murugappan.dev/nope", {
        headers: {Accept: "text/html,application/xhtml+xml"}
      }),
      fakeAssets() as never
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
    expect(res.headers.get("Vary")).toBe("Accept");
    expect(res.headers.get("Link")).toContain('rel="service-desc"');
    expect(await res.text()).toBe(NOT_FOUND_HTML);
  });

  it("falls back to markdown when the assets layer serves no HTML page", async () => {
    const emptyAssets = {
      fetch: () => Promise.resolve(new Response(null, {status: 404}))
    };
    const res = await serveAsset(
      new Request("https://murugappan.dev/nope", {
        headers: {Accept: "text/html"}
      }),
      emptyAssets as never
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/markdown/);
    expect(await res.text()).toContain("# 404 Not Found");
  });

  it("sends the page's headers but no body for a HEAD", async () => {
    const res = await serveAsset(
      new Request("https://murugappan.dev/nope", {
        method: "HEAD",
        headers: {Accept: "text/html"}
      }),
      fakeAssets() as never
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
    expect(await res.text()).toBe("");
  });
});

describe("the worker's 404", () => {
  it("answers 404 — never 200 — for a path that does not exist", async () => {
    const res = await fetchPath("/some-path-that-does-not-exist");
    expect(res.status).toBe(404);
  });

  it("gives an agent markdown it can act on", async () => {
    const res = await fetchPath("/some-path-that-does-not-exist");
    expect(res.headers.get("Content-Type")).toMatch(/^text\/markdown/);
    const body = await res.text();
    expect(body).toContain("# 404 Not Found");
    expect(body).toContain("https://murugappan.dev/sitemap.xml");
  });

  it("still serves the styled page to a browser", async () => {
    const res = await fetchPath("/some-path-that-does-not-exist", {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9"
      }
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
  });

  it("does not touch a path that does exist", async () => {
    const res = await fetchPath("/llms.txt");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(LLMS_TXT);
  });
});
