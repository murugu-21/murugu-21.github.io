// WebMCP (https://webmachinelearning.github.io/webmcp/): expose the site's
// key actions as tools that in-browser AI agents can call via
// navigator.modelContext. Feature-detected — a no-op everywhere the API
// doesn't exist, so regular visitors never pay for it beyond this check.
// Loaded from both apps' layouts (the blog imports across the monorepo the
// same way it does the chat widget).

type ToolResult = {content: Array<{type: "text"; text: string}>};

interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: object;
  signal?: AbortSignal;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}

interface ModelContext {
  registerTool(tool: ModelContextTool): void;
}

const mc = (navigator as Navigator & {modelContext?: ModelContext})
  .modelContext;

if (mc && typeof mc.registerTool === "function") {
  // one signal for all tools; aborting on pagehide unregisters them
  const controller = new AbortController();
  addEventListener("pagehide", () => controller.abort());

  const text = (t: string): ToolResult => ({
    content: [{type: "text", text: t}]
  });
  const fetchText = async (path: string): Promise<string> => {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${res.status} for ${path}`);
    return res.text();
  };

  const tools: ModelContextTool[] = [
    {
      name: "get_profile",
      description:
        "Murugappan M's full professional profile as markdown: pitch, work experience, skills, education, open-source work, and links (resume PDF, GitHub, LinkedIn, blog, RSS).",
      inputSchema: {type: "object", properties: {}},
      execute: async () => text(await fetchText("/llms.txt"))
    },
    {
      name: "list_blog_posts",
      description:
        "List every post on the SDE Journey blog with title, URL, and summary (markdown). Post slugs for read_blog_post are the last path segment of each URL.",
      inputSchema: {type: "object", properties: {}},
      execute: async () => text(await fetchText("/blog/index.md"))
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
            description: "Post slug — the last path segment of the post URL"
          }
        },
        required: ["slug"]
      },
      execute: async args => {
        const slug = String(args.slug ?? "");
        if (!/^[a-z0-9-]+$/.test(slug))
          return text("Invalid slug. Call list_blog_posts to find slugs.");
        try {
          return text(await fetchText(`/blog/${slug}/index.md`));
        } catch {
          return text(
            `No post found for slug '${slug}'. Call list_blog_posts to see what exists.`
          );
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
        const path = String(args.path ?? "");
        // same-origin only: site-relative, and "//host" would be scheme-relative
        if (!path.startsWith("/") || path.startsWith("//"))
          return text(
            "Only site-relative paths starting with '/' are allowed."
          );
        location.assign(path);
        return text(`Navigating to ${path}`);
      }
    }
  ];

  for (const tool of tools) {
    tool.signal = controller.signal;
    try {
      mc.registerTool(tool);
    } catch {
      // draft API — shape may shift between engine versions; never break the page
    }
  }
}
