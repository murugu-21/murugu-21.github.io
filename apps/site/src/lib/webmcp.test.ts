import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const FILES = new Map([
  ["/llms.txt", "# Murugappan M"],
  ["/blog/index.md", "- [Post](https://murugappan.dev/blog/post/)"],
  ["/blog/post/index.md", "# Post body"]
]);

async function bootPage({
  registerTool,
  supported = true
}: {
  registerTool?: (tool: WebMCP.ModelContextTool) => Promise<void>;
  supported?: boolean;
}) {
  const tools = new Map<string, WebMCP.ModelContextTool>();
  const navigations: string[] = [];
  const modelContext = {
    registerTool:
      registerTool ??
      (async (tool: WebMCP.ModelContextTool) => {
        tools.set(tool.name, tool);
      })
  };
  vi.stubGlobal("document", supported ? { modelContext } : {});
  vi.stubGlobal("location", {
    origin: "https://murugappan.dev",
    assign: (url: string) => navigations.push(url)
  });
  vi.stubGlobal("fetch", async (path: string) => {
    const body = FILES.get(path);
    return body === undefined ? new Response("", { status: 404 }) : new Response(body);
  });
  vi.resetModules();
  await import("./webmcp");

  const run = (name: string, args: Parameters<WebMCP.ModelContextTool["execute"]>[0] = {}) => {
    const tool = tools.get(name);
    if (!tool) throw new Error(`${name} was not registered`);
    return tool.execute(args, { signal: new AbortController().signal });
  };
  return { tools, navigations, run };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("WebMCP tools", () => {
  it("reads the profile and the post list as text from the site's markdown routes", async () => {
    const { run } = await bootPage({});
    expect(await run("get_profile")).toBe("# Murugappan M");
    expect(await run("list_blog_posts")).toBe("- [Post](https://murugappan.dev/blog/post/)");
  });

  it("reads a post by slug, and explains a slug that does not exist or is malformed", async () => {
    const { run } = await bootPage({});
    expect(await run("get_blog_post", { slug: "post" })).toBe("# Post body");
    expect(await run("get_blog_post", { slug: "missing" })).toBe(
      "No post found for slug 'missing'. Call list_blog_posts to see what exists."
    );
    expect(await run("get_blog_post", { slug: "../etc/passwd" })).toBe(
      "Invalid slug. Call list_blog_posts to find slugs."
    );
    expect(await run("get_blog_post", { slug: 7 })).toBe(
      "Invalid slug. Call list_blog_posts to find slugs."
    );
  });

  it("navigates to pages on this site, given a path or a full URL, and nowhere else", async () => {
    const { run, navigations } = await bootPage({});
    expect(await run("navigate_to", { path: "/blog/" })).toBe(
      "Navigating to https://murugappan.dev/blog/"
    );
    expect(await run("navigate_to", { path: "https://murugappan.dev/about/" })).toBe(
      "Navigating to https://murugappan.dev/about/"
    );
    for (const path of [
      "//evil.example/",
      "/\\evil.example",
      "https://evil.example/",
      "javascript:alert(1)",
      "https://",
      7
    ]) {
      expect(await run("navigate_to", { path })).toBe(
        "Only pages on this site are allowed, such as '/blog/'."
      );
    }
    expect(navigations).toEqual(["https://murugappan.dev/blog/", "https://murugappan.dev/about/"]);
  });

  it("survives a registration that rejects and reports which tool failed", async () => {
    const warnings: unknown[][] = [];
    vi.spyOn(console, "warn").mockImplementation((...args) => void warnings.push(args));

    await bootPage({
      registerTool: tool => Promise.reject(new Error(`no room for ${tool.name}`))
    });
    await vi.waitFor(() => expect(warnings).toHaveLength(4));

    expect(warnings[0]?.[0]).toBe("[webmcp] couldn't register get_profile");
    expect(warnings[3]?.[0]).toBe("[webmcp] couldn't register navigate_to");
  });

  it("registers nothing in a browser without WebMCP", async () => {
    expect((await bootPage({})).tools.size).toBe(4);
    expect((await bootPage({ supported: false })).tools.size).toBe(0);
  });
});
