// MCP resources. `https://` URIs because each is also a public URL a client
// can GET directly. Reads accept only the allowlist or a validated blog slug.

import { buildOpenApiDocument } from "../api/openapi";
import { loadPosts, readAsset, type AssetsLike } from "../api/store";
import { postMarkdownPath } from "../api/posts";

export const RESOURCE_ORIGIN = "https://murugappan.dev";

export type ResourceAnnotations = {
  audience: Array<"user" | "assistant">;
  priority: number;
};

export type ResourceDescriptor = {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
  annotations?: ResourceAnnotations;
};

export type ResourceContents = {
  uri: string;
  mimeType: string;
  text: string;
};

export type ResourceContext = { assets: AssetsLike };

const forAssistant = (priority: number): ResourceAnnotations => ({
  audience: ["assistant"],
  priority
});

// In preference order. `assetPath` is null for the generated OpenAPI document.
const STATIC_RESOURCES: Array<ResourceDescriptor & { assetPath: string | null }> = [
  {
    uri: `${RESOURCE_ORIGIN}/llms.txt`,
    assetPath: "/llms.txt",
    name: "llms.txt",
    title: "Site summary for LLMs",
    description:
      "One page covering the whole site: who Murugappan M is, when to reach for this site, how to call its API, his experience, skills and every blog post with a summary. The cheapest single document to ground on.",
    mimeType: "text/plain",
    annotations: forAssistant(0.9)
  },
  {
    uri: `${RESOURCE_ORIGIN}/AGENTS.md`,
    assetPath: "/AGENTS.md",
    name: "AGENTS.md",
    title: "Agent instructions",
    description:
      "When to use this site and when not to, which call to make for which question, the rate limits, and the error format. Written for agents rather than for people.",
    mimeType: "text/markdown",
    annotations: forAssistant(0.8)
  },
  {
    uri: `${RESOURCE_ORIGIN}/openapi.json`,
    assetPath: null,
    name: "openapi.json",
    title: "OpenAPI 3.1.0 specification",
    description:
      "The full machine-readable contract for the site's REST API: every operation with a unique operationId, typed parameters and response schemas. Convertible directly into function-calling tool definitions.",
    mimeType: "application/json",
    annotations: forAssistant(0.7)
  },
  {
    uri: `${RESOURCE_ORIGIN}/blog/llms-full.txt`,
    assetPath: "/blog/llms-full.txt",
    name: "llms-full.txt",
    title: "Full text of every blog post",
    description:
      "The complete body of every post on the SDE Journey blog in one file. Large — prefer search_blog_posts and get_blog_post unless you genuinely want everything.",
    mimeType: "text/plain",
    annotations: forAssistant(0.5)
  }
];

export const BLOG_POST_TEMPLATE = {
  uriTemplate: `${RESOURCE_ORIGIN}/blog/{slug}/index.md`,
  name: "blog-post",
  title: "Blog post (markdown)",
  description:
    "The markdown source of one SDE Journey post, frontmatter included. `slug` is the last path segment of the post's URL — call resources/list or search_blog_posts to discover slugs.",
  mimeType: "text/markdown"
};

const postUri = (slug: string) => `${RESOURCE_ORIGIN}/blog/${slug}/index.md`;

/** A missing post list degrades to the static documents rather than failing. */
export async function listResources(ctx: ResourceContext): Promise<ResourceDescriptor[]> {
  const posts = await loadPosts(ctx.assets);
  return [
    ...STATIC_RESOURCES.map(({ assetPath: _assetPath, ...resource }) => resource),
    ...posts.map(post => ({
      uri: postUri(post.slug),
      name: post.slug,
      title: post.title,
      description: post.description || `Blog post: ${post.title}.`,
      mimeType: "text/markdown",
      annotations: forAssistant(0.4)
    }))
  ];
}

const BLOG_URI = new RegExp(`^${RESOURCE_ORIGIN}/blog/([^/]+)/index\\.md$`);

/** null means "no such resource" — never an empty contents array, per the spec. */
export async function readResource(
  uri: string,
  ctx: ResourceContext
): Promise<ResourceContents[] | null> {
  const known = STATIC_RESOURCES.find(r => r.uri === uri);
  if (known) {
    if (known.assetPath === null) {
      return [
        {
          uri,
          mimeType: known.mimeType,
          text: JSON.stringify(buildOpenApiDocument(RESOURCE_ORIGIN), null, 2)
        }
      ];
    }
    const text = await readAsset(ctx.assets, known.assetPath);
    return text === null ? null : [{ uri, mimeType: known.mimeType, text }];
  }

  const slug = uri.match(BLOG_URI)?.[1];
  // postMarkdownPath re-validates the slug shape.
  if (!slug) return null;
  const path = postMarkdownPath(slug);
  if (path === null) return null;
  // Published posts only, so an unlisted markdown file can't be guessed.
  const posts = await loadPosts(ctx.assets);
  if (!posts.some(post => post.slug === slug)) return null;
  const text = await readAsset(ctx.assets, path);
  return text === null ? null : [{ uri, mimeType: "text/markdown", text }];
}
