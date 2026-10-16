// WebMCP: https://webmachinelearning.github.io/webmcp/

import type { WebMCP } from "webmcp-types";

import { WEBMCP_TOOL_NAMES, type WebMcpToolName } from "@murugappan/contracts/webmcp.ts";

const mc = document.modelContext;

// Arguments come from the agent, so each tool checks its own instead of trusting inputSchema.
const isSlug = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9-]+$/.test(value);

const isOnSite = (value: unknown): value is string =>
  typeof value === "string" &&
  URL.canParse(value, location.origin) &&
  new URL(value, location.origin).origin === location.origin;

if (mc) {
  const fetchText = async (path: string): Promise<string> => {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${res.status} for ${path}`);
    return res.text();
  };

  // Each execute resolves to plain text, since the browser hands an object to
  // the agent as a JSON string.
  const tools: Record<WebMcpToolName, Omit<WebMCP.ModelContextTool, "name">> = {
    get_profile: {
      description:
        "Murugappan M's full professional profile as markdown: pitch, work experience, skills, education, open-source work, and links (resume PDF, GitHub, LinkedIn, blog, RSS).",
      inputSchema: { type: "object", properties: {} },
      execute: () => fetchText("/llms.txt")
    },
    list_blog_posts: {
      description:
        "List every post on the SDE Journey blog with title, URL, and summary (markdown). Post slugs for get_blog_post are the last path segment of each URL.",
      inputSchema: { type: "object", properties: {} },
      execute: () => fetchText("/blog/index.md")
    },
    get_blog_post: {
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
      execute: async ({ slug }) => {
        if (!isSlug(slug)) return "Invalid slug. Call list_blog_posts to find slugs.";
        try {
          return await fetchText(`/blog/${slug}/index.md`);
        } catch {
          return `No post found for slug '${slug}'. Call list_blog_posts to see what exists.`;
        }
      }
    },
    navigate_to: {
      description:
        "Navigate this tab to a page on murugappan.dev, e.g. '/', '/blog/', '/blog/<slug>/', or '/resume.pdf'.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "A path such as '/blog/', or a full URL on this site"
          }
        },
        required: ["path"]
      },
      execute: async ({ path }) => {
        if (!isOnSite(path)) return "Only pages on this site are allowed, such as '/blog/'.";
        const { href } = new URL(path, location.origin);
        location.assign(href);
        return `Navigating to ${href}`;
      }
    }
  };

  // Async, so a polyfill that throws or returns no promise rejects instead of
  // throwing here, which would stop the analytics bundled into the same script.
  const register = async (tool: WebMCP.ModelContextTool) => mc.registerTool(tool);

  for (const name of WEBMCP_TOOL_NAMES) {
    register({ name, ...tools[name] }).catch((cause: unknown) => {
      console.warn(`[webmcp] couldn't register ${name}`, cause);
    });
  }
}
