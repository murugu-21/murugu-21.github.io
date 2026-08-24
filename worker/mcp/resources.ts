// MCP resources: the site's machine-readable documents, offered as
// application-selectable context rather than as model-invoked tools.
//
// All URIs use the `https://` scheme, which the spec reserves for resources the
// client "is able to fetch and load ... directly from the web on its own" — and
// these genuinely are: every one is a public URL on murugappan.dev. A client
// that would rather not go through the MCP server can just GET them.
//
// The read side is an explicit allowlist plus a slug-validated blog path; no
// part of an incoming URI is ever used to build an asset path without being
// matched against one of those two shapes first.

import {buildOpenApiDocument} from "../api/openapi";
import {loadPosts} from "../api/store";
import {postMarkdownPath} from "../api/posts";
import type {AssetsLike} from "../api/store";

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

export type ResourceContext = {assets: AssetsLike};

const forAssistant = (priority: number): ResourceAnnotations => ({
  audience: ["assistant"],
  priority
});

// Static documents, in the order a client should prefer them. `assetPath` is
// null for the OpenAPI document, which the Worker generates rather than serves
// from the build.
const STATIC_RESOURCES: Array<ResourceDescriptor & {assetPath: string | null}> =
  [
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

/**
 * The static documents followed by one entry per published post. A missing
 * post list degrades to the static documents rather than failing the call —
 * `resources/list` is how a client discovers the server at all.
 */
export async function listResources(
  ctx: ResourceContext
): Promise<ResourceDescriptor[]> {
  const posts = await loadPosts(ctx.assets);
  return [
    ...STATIC_RESOURCES.map(({assetPath: _assetPath, ...resource}) => resource),
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

async function readAsset(
  ctx: ResourceContext,
  path: string
): Promise<string | null> {
  try {
    const res = await ctx.assets.fetch(`https://assets.local${path}`);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

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
    const text = await readAsset(ctx, known.assetPath);
    return text === null ? null : [{uri, mimeType: known.mimeType, text}];
  }

  const slug = uri.match(BLOG_URI)?.[1];
  // postMarkdownPath re-validates the slug shape, so nothing from the URI
  // reaches an asset path unchecked.
  if (!slug || postMarkdownPath(slug) === null) return null;
  // Only posts the site actually publishes, so an unlisted markdown file
  // cannot be reached by guessing a slug.
  const posts = await loadPosts(ctx.assets);
  if (!posts.some(post => post.slug === slug)) return null;
  const text = await readAsset(ctx, postMarkdownPath(slug)!);
  return text === null ? null : [{uri, mimeType: "text/markdown", text}];
}
