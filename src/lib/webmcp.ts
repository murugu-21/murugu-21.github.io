// WebMCP (https://webmachinelearning.github.io/webmcp/): site actions as tools
// for in-browser agents via document.modelContext. No-op without the API.

import type { WebMCP } from "webmcp-types";

const mc = document.modelContext;

if (mc) {
  const fetchText = async (path: string): Promise<string> => {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${res.status} for ${path}`);
    return res.text();
  };

  // Each execute resolves to plain text, since the browser hands an object to
  // the agent as a JSON string.
  const tools: WebMCP.ModelContextTool[] = [
    {
      name: "get_profile",
      description:
        "Murugappan M's full professional profile as markdown: pitch, work experience, skills, education, open-source work, and links (resume PDF, GitHub, LinkedIn, blog, RSS).",
      inputSchema: { type: "object", properties: {} },
      execute: () => fetchText("/llms.txt")
    },
    {
      name: "list_blog_posts",
      description:
        "List every post on the SDE Journey blog with title, URL, and summary (markdown). Post slugs for read_blog_post are the last path segment of each URL.",
      inputSchema: { type: "object", properties: {} },
      execute: () => fetchText("/blog/index.md")
    },
    {
      name: "read_blog_post",
      description:
        "Read a blog post's full markdown content by slug (e.g. 'cloud-agnostic-rate-limiting'). Use list_blog_posts to discover slugs.",
      inputSchema: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "Post slug, the last path segment of the post URL"
          }
        },
        required: ["slug"]
      },
      execute: async args => {
        const slug = typeof args.slug === "string" ? args.slug : "";
        if (!/^[a-z0-9-]+$/.test(slug)) return "Invalid slug. Call list_blog_posts to find slugs.";
        try {
          return await fetchText(`/blog/${slug}/index.md`);
        } catch {
          return `No post found for slug '${slug}'. Call list_blog_posts to see what exists.`;
        }
      }
    },
    {
      name: "navigate_to",
      description:
        "Navigate this tab to a page on murugappan.dev, e.g. '/', '/blog/', '/blog/<slug>/', or '/resume.pdf'.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Site-relative path starting with '/'"
          }
        },
        required: ["path"]
      },
      execute: async args => {
        const path = typeof args.path === "string" ? args.path : "";
        // same-origin only: site-relative, and "//host" would be scheme-relative
        if (!path.startsWith("/") || path.startsWith("//"))
          return "Only site-relative paths starting with '/' are allowed.";
        location.assign(path);
        return `Navigating to ${path}`;
      }
    }
  ];

  // Async, so a polyfill that throws or returns no promise rejects instead of
  // throwing here, which would stop the analytics bundled into the same script.
  const register = async (tool: WebMCP.ModelContextTool) => mc.registerTool(tool);

  // Tools live as long as the document, bfcache included, so none needs an abort signal.
  for (const tool of tools) {
    register(tool).catch((error: unknown) => {
      console.warn(`[webmcp] couldn't register ${tool.name}`, error);
    });
  }
}
