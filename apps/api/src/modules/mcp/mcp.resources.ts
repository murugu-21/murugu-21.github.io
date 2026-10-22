import {
  ProtocolError,
  ResourceNotFoundError,
  ResourceTemplate,
  type McpServer
} from "@modelcontextprotocol/server";

import { SITE_ORIGIN } from "@murugappan/content/site.ts";
import type { PostSummary } from "@murugappan/contracts/api/posts.ts";
import { MCP_RESOURCES, type McpResourceKey } from "@murugappan/contracts/mcp.ts";
import { DOCUMENTS } from "@murugappan/contracts/surface.ts";
import { runInRequest } from "#src/app.module.ts";
import { AGENTS_MD, LLMS_FULL_TXT, LLMS_TXT } from "#src/common/content.ts";
import type { Render } from "#src/common/di/render.ts";
import { refusedRead, type ToolContext } from "#src/modules/mcp/mcp.tools.ts";
import { buildOpenApiDocument } from "#src/modules/openapi/openapi-document.ts";
import type { Post, PostNotFound } from "#src/modules/posts/posts.repository.ts";
import { PostsService } from "#src/modules/posts/posts.service.ts";
import type { VisitorKey } from "#src/modules/rate-limit/visitor-key.ts";

type ResourceAnnotations = {
  audience: Array<"user" | "assistant">;
  priority: number;
};

type ResourceDescriptor = {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
  annotations?: ResourceAnnotations;
};

type ResourceContents = {
  uri: string;
  mimeType: string;
  text: string;
};

const forAssistant = (priority: number): ResourceAnnotations => ({
  audience: ["assistant"],
  priority
});

type StaticResource = { text: () => string; description: string; priority: number };

const STATIC_RESOURCES: Record<McpResourceKey, StaticResource> = {
  llms: {
    text: () => LLMS_TXT,
    description:
      "One page covering the whole site: who Murugappan M is, when to reach for this site, how to call its API, his experience, skills and every blog post with a summary. The cheapest single document to ground on.",
    priority: 0.9
  },
  agentGuide: {
    text: () => AGENTS_MD,
    description:
      "When to use this site and when not to, which call to make for which question, the rate limits, and the error format. Written for agents rather than for people.",
    priority: 0.8
  },
  openapi: {
    text: () => JSON.stringify(buildOpenApiDocument(SITE_ORIGIN), null, 2),
    description:
      "The full machine-readable contract for the site's REST API: every operation with a unique operationId, typed parameters and response schemas. Convertible directly into function-calling tool definitions.",
    priority: 0.7
  },
  llmsFull: {
    text: () => LLMS_FULL_TXT,
    description:
      "The complete body of every post on the SDE Journey blog in one file. It is large, so prefer search_blog_posts and get_blog_post unless you want everything.",
    priority: 0.5
  }
};

const BLOG_POST_TEMPLATE = {
  uriTemplate: `${SITE_ORIGIN}/blog/{slug}/index.md`,
  name: "blog-post",
  title: "Blog post (markdown)",
  description:
    "The markdown source of one SDE Journey post, frontmatter included. `slug` is the last path segment of the post's URL. Call resources/list or search_blog_posts to discover slugs.",
  mimeType: "text/markdown"
};

const postUri = (slug: string) => `${SITE_ORIGIN}/blog/${slug}/index.md`;

const postResources = (posts: PostSummary[]): ResourceDescriptor[] =>
  posts.map(post => ({
    uri: postUri(post.slug),
    name: post.slug,
    title: post.title,
    description: post.description || `Blog post: ${post.title}.`,
    mimeType: "text/markdown",
    annotations: forAssistant(0.4)
  }));

const contents = (content: ResourceContents) => ({ contents: [content] });

// JSON-RPC leaves -32000 to -32099 to the server; resources have no isError result.
const RATE_LIMITED = -32000;

function spendRead(visitor: VisitorKey | null): void {
  const refused = refusedRead(visitor);
  if (refused) throw new ProtocolError(RATE_LIMITED, refused);
}

const markdownOrNull: Render<Post, PostNotFound, string | null> = {
  success: post => post.markdown,
  failures: { PostNotFound: () => null }
};

// A missing post throws ResourceNotFoundError, which the SDK answers with -32602; the spec forbids
// an empty contents array.
export function registerResources(server: McpServer, { services, visitor }: ToolContext): void {
  for (const key of MCP_RESOURCES) {
    const { path, title, type: mimeType } = DOCUMENTS[key];
    const { text, description, priority } = STATIC_RESOURCES[key];
    const uri = `${SITE_ORIGIN}${path}`;
    const name = path.slice(path.lastIndexOf("/") + 1);
    const metadata = { title, description, mimeType, annotations: forAssistant(priority) };
    server.registerResource(name, uri, metadata, () => {
      spendRead(visitor);
      return contents({ uri, mimeType, text: text() });
    });
  }

  const { uriTemplate, name, ...metadata } = BLOG_POST_TEMPLATE;
  const list = () =>
    runInRequest({
      services,
      program: PostsService.use(posts => posts.search({})),
      render: { success: ({ posts }) => ({ resources: postResources(posts) }), failures: {} }
    });
  const template = new ResourceTemplate(uriTemplate, { list });
  server.registerResource(name, template, metadata, async (uri, { slug }) => {
    spendRead(visitor);
    if (slug === undefined || Array.isArray(slug)) throw new ResourceNotFoundError(uri.href);
    const markdown = await runInRequest({
      services,
      program: PostsService.use(posts => posts.findBySlug(slug)),
      render: markdownOrNull
    });
    if (markdown === null) throw new ResourceNotFoundError(uri.href);
    return contents({ uri: uri.href, mimeType: metadata.mimeType, text: markdown });
  });
}
