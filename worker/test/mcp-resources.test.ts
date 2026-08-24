import {describe, expect, it} from "vitest";

import {
  BLOG_POST_TEMPLATE,
  listResources,
  readResource,
  RESOURCE_ORIGIN
} from "../mcp/resources";
import {
  AGENTS_MD,
  fakeAssets,
  LLMS_FULL_TXT,
  LLMS_TXT,
  POST_MARKDOWN
} from "./fixtures";

const ctx = (overrides: Record<string, string | null> = {}) => ({
  assets: fakeAssets(overrides)
});

describe("listResources", () => {
  it("lists the site's machine-readable documents and every blog post", async () => {
    const uris = (await listResources(ctx())).map(r => r.uri);
    expect(uris).toEqual([
      `${RESOURCE_ORIGIN}/llms.txt`,
      `${RESOURCE_ORIGIN}/AGENTS.md`,
      `${RESOURCE_ORIGIN}/openapi.json`,
      `${RESOURCE_ORIGIN}/blog/llms-full.txt`,
      `${RESOURCE_ORIGIN}/blog/cloud-agnostic-rate-limiting/index.md`,
      `${RESOURCE_ORIGIN}/blog/coin-change-problem/index.md`
    ]);
  });

  it("gives every resource a name, title, description and mime type", async () => {
    for (const resource of await listResources(ctx())) {
      expect(resource.name, resource.uri).toBeTruthy();
      expect(resource.title, resource.uri).toBeTruthy();
      expect(resource.description, resource.uri).toBeTruthy();
      expect(resource.mimeType, resource.uri).toBeTruthy();
    }
  });

  it("annotates resources for the assistant with a priority", async () => {
    for (const resource of await listResources(ctx())) {
      expect(resource.annotations?.audience, resource.uri).toContain(
        "assistant"
      );
      const priority = resource.annotations?.priority ?? -1;
      expect(priority, resource.uri).toBeGreaterThan(0);
      expect(priority, resource.uri).toBeLessThanOrEqual(1);
    }
  });

  it("ranks the site summary above an individual blog post", async () => {
    const byUri = new Map(
      (await listResources(ctx())).map(r => [r.uri, r.annotations?.priority])
    );
    expect(byUri.get(`${RESOURCE_ORIGIN}/llms.txt`)!).toBeGreaterThan(
      byUri.get(`${RESOURCE_ORIGIN}/blog/coin-change-problem/index.md`)!
    );
  });

  it("still lists the static documents when the post list is unavailable", async () => {
    const uris = (await listResources(ctx({"/llms.txt": null}))).map(
      r => r.uri
    );
    expect(uris).toContain(`${RESOURCE_ORIGIN}/openapi.json`);
    expect(uris.some(u => u.includes("/blog/coin-change"))).toBe(false);
  });

  it("uses each post's title and summary from the site's own post list", async () => {
    const post = (await listResources(ctx())).find(r =>
      r.uri.includes("cloud-agnostic-rate-limiting")
    )!;
    expect(post.title).toBe("Modern distributed rate limiting in the cloud");
    expect(post.description).toContain("per-user rate limiting");
  });
});

describe("BLOG_POST_TEMPLATE", () => {
  it("is an RFC 6570 template over the post slug", () => {
    expect(BLOG_POST_TEMPLATE.uriTemplate).toBe(
      `${RESOURCE_ORIGIN}/blog/{slug}/index.md`
    );
    expect(BLOG_POST_TEMPLATE.mimeType).toBe("text/markdown");
    expect(BLOG_POST_TEMPLATE.description).toBeTruthy();
  });
});

describe("readResource", () => {
  it("reads llms.txt as text", async () => {
    const contents = await readResource(`${RESOURCE_ORIGIN}/llms.txt`, ctx());
    expect(contents).toEqual([
      {
        uri: `${RESOURCE_ORIGIN}/llms.txt`,
        mimeType: "text/plain",
        text: LLMS_TXT
      }
    ]);
  });

  it("reads AGENTS.md as markdown", async () => {
    const contents = await readResource(`${RESOURCE_ORIGIN}/AGENTS.md`, ctx());
    expect(contents![0].text).toBe(AGENTS_MD);
    expect(contents![0].mimeType).toBe("text/markdown");
  });

  it("reads the full blog text", async () => {
    const contents = await readResource(
      `${RESOURCE_ORIGIN}/blog/llms-full.txt`,
      ctx()
    );
    expect(contents![0].text).toBe(LLMS_FULL_TXT);
  });

  it("generates the OpenAPI document rather than reading a file", async () => {
    const contents = await readResource(
      `${RESOURCE_ORIGIN}/openapi.json`,
      ctx()
    );
    expect(contents![0].mimeType).toBe("application/json");
    const doc = JSON.parse(contents![0].text) as {
      openapi: string;
      servers: Array<{url: string}>;
    };
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers[0].url).toBe(RESOURCE_ORIGIN);
  });

  it("reads a blog post's markdown", async () => {
    const uri = `${RESOURCE_ORIGIN}/blog/coin-change-problem/index.md`;
    const contents = await readResource(uri, ctx());
    expect(contents).toEqual([
      {uri, mimeType: "text/markdown", text: POST_MARKDOWN}
    ]);
  });

  it("returns null for a post that is not published", async () => {
    expect(
      await readResource(`${RESOURCE_ORIGIN}/blog/ghost/index.md`, ctx())
    ).toBeNull();
  });

  it("returns null for a listed post whose markdown is missing", async () => {
    expect(
      await readResource(
        `${RESOURCE_ORIGIN}/blog/cloud-agnostic-rate-limiting/index.md`,
        ctx()
      )
    ).toBeNull();
  });

  it("returns null rather than an empty contents array for an unknown uri", async () => {
    expect(await readResource(`${RESOURCE_ORIGIN}/secrets`, ctx())).toBeNull();
    expect(await readResource("not a uri", ctx())).toBeNull();
  });

  it("refuses a path-traversal attempt in the slug position", async () => {
    for (const uri of [
      `${RESOURCE_ORIGIN}/blog/../../llms.txt/index.md`,
      `${RESOURCE_ORIGIN}/blog/..%2F..%2Fllms.txt/index.md`,
      `${RESOURCE_ORIGIN}/blog/Mixed_Case/index.md`
    ]) {
      expect(await readResource(uri, ctx()), uri).toBeNull();
    }
  });

  it("refuses a same-path uri on another origin", async () => {
    expect(
      await readResource("https://evil.example/llms.txt", ctx())
    ).toBeNull();
    expect(
      await readResource(
        "https://evil.example/blog/coin-change-problem/index.md",
        ctx()
      )
    ).toBeNull();
  });

  it("returns null when a static document is not deployed", async () => {
    expect(
      await readResource(
        `${RESOURCE_ORIGIN}/llms.txt`,
        ctx({"/llms.txt": null})
      )
    ).toBeNull();
  });
});
