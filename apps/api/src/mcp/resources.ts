// MCP resources. The URIs are `https://` because each is also a public URL a
// client can GET directly. Reads accept only the allowlist or a validated blog slug.

import {
  ResourceNotFoundError,
  ResourceTemplate,
  type McpServer
} from "@modelcontextprotocol/server";

import { SITE_ORIGIN } from "@murugappan/content/site.ts";
import { buildOpenApiDocument } from "#src/api/openapi.ts";
import { AGENTS_MD, findPost, LLMS_FULL_TXT, LLMS_TXT, POSTS } from "#src/content.ts";

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

// In preference order.
const STATIC_RESOURCES: Array<ResourceDescriptor & { text: () => string }> = [
  {
    uri: `${SITE_ORIGIN}/llms.txt`,
    text: () => LLMS_TXT,
    name: "llms.txt",
    title: "Site summary for LLMs",
    description:
      "One page covering the whole site: who Murugappan M is, when to reach for this site, how to call its API, his experience, skills and every blog post with a summary. The cheapest single document to ground on.",
    mimeType: "text/plain",
    annotations: forAssistant(0.9)
  },
  {
    uri: `${SITE_ORIGIN}/AGENTS.md`,
    text: () => AGENTS_MD,
    name: "AGENTS.md",
    title: "Agent instructions",
    description:
      "When to use this site and when not to, which call to make for which question, the rate limits, and the error format. Written for agents rather than for people.",
    mimeType: "text/markdown",
    annotations: forAssistant(0.8)
  },
  {
    uri: `${SITE_ORIGIN}/openapi.json`,
    text: () => JSON.stringify(buildOpenApiDocument(SITE_ORIGIN), null, 2),
    name: "openapi.json",
    title: "OpenAPI 3.1.0 specification",
    description:
      "The full machine-readable contract for the site's REST API: every operation with a unique operationId, typed parameters and response schemas. Convertible directly into function-calling tool definitions.",
    mimeType: "application/json",
    annotations: forAssistant(0.7)
  },
  {
    uri: `${SITE_ORIGIN}/blog/llms-full.txt`,
    text: () => LLMS_FULL_TXT,
    name: "llms-full.txt",
    title: "Full text of every blog post",
    description:
      "The complete body of every post on the SDE Journey blog in one file. It is large, so prefer search_blog_posts and get_blog_post unless you want everything.",
    mimeType: "text/plain",
    annotations: forAssistant(0.5)
  }
];

const BLOG_POST_TEMPLATE = {
  uriTemplate: `${SITE_ORIGIN}/blog/{slug}/index.md`,
  name: "blog-post",
  title: "Blog post (markdown)",
  description:
    "The markdown source of one SDE Journey post, frontmatter included. `slug` is the last path segment of the post's URL. Call resources/list or search_blog_posts to discover slugs.",
  mimeType: "text/markdown"
};

const postUri = (slug: string) => `${SITE_ORIGIN}/blog/${slug}/index.md`;

const listPostResources = (): ResourceDescriptor[] =>
  POSTS.map(post => ({
    uri: postUri(post.slug),
    name: post.slug,
    title: post.title,
    description: post.description || `Blog post: ${post.title}.`,
    mimeType: "text/markdown",
    annotations: forAssistant(0.4)
  }));

const contents = (content: ResourceContents) => ({ contents: [content] });

// A missing post throws ResourceNotFoundError, which the SDK answers with -32602; the spec forbids
// an empty contents array.
export function registerResources(server: McpServer): void {
  for (const { text, uri, name, ...metadata } of STATIC_RESOURCES) {
    server.registerResource(name, uri, metadata, () =>
      contents({ uri, mimeType: metadata.mimeType, text: text() })
    );
  }

  const { uriTemplate, name, ...metadata } = BLOG_POST_TEMPLATE;
  const list = () => ({ resources: listPostResources() });
  const template = new ResourceTemplate(uriTemplate, { list });
  server.registerResource(name, template, metadata, (uri, { slug }) => {
    const post = typeof slug === "string" ? findPost(slug) : undefined;
    if (!post) throw new ResourceNotFoundError(uri.href);
    return contents({ uri: uri.href, mimeType: metadata.mimeType, text: post.markdown });
  });
}
