import { afterEach, describe, expect, it, vi } from "vitest";

const FILES: Record<string, string> = {
  "/llms.txt": "# Murugappan M",
  "/blog/index.md": "- [Post](https://murugappan.dev/blog/post/)",
  "/blog/post/index.md": "# Post body"
};

async function bootPage({
  registerTool,
  supported = true
}: {
  registerTool?: (tool: WebMCP.ModelContextTool) => unknown;
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
  vi.stubGlobal("location", { assign: (path: string) => navigations.push(path) });
  vi.stubGlobal("fetch", async (path: string) => {
    const body = FILES[path];
    return body === undefined ? new Response("", { status: 404 }) : new Response(body);
  });
  vi.resetModules();
  await import("./webmcp");

  const run = (name: string, args: Record<string, unknown> = {}) => {
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
    expect(await run("read_blog_post", { slug: "post" })).toBe("# Post body");
    expect(await run("read_blog_post", { slug: "missing" })).toBe(
      "No post found for slug 'missing'. Call list_blog_posts to see what exists."
    );
    expect(await run("read_blog_post", { slug: "../etc/passwd" })).toBe(
      "Invalid slug. Call list_blog_posts to find slugs."
    );
    expect(await run("read_blog_post", { slug: 7 })).toBe(
      "Invalid slug. Call list_blog_posts to find slugs."
    );
  });

  it("navigates to site-relative paths only", async () => {
    const { run, navigations } = await bootPage({});
    expect(await run("navigate_to", { path: "/blog/" })).toBe("Navigating to /blog/");
    expect(await run("navigate_to", { path: "//evil.example/" })).toBe(
      "Only site-relative paths starting with '/' are allowed."
    );
    expect(await run("navigate_to", { path: "https://evil.example/" })).toBe(
      "Only site-relative paths starting with '/' are allowed."
    );
    expect(navigations).toEqual(["/blog/"]);
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
