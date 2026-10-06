// Posts are parsed from llms.txt ("- [title](url): description", built by src/pages/llms.txt.ts),
// the same file Jarvis is grounded on, so the API cannot fall behind the blog.

import { z } from "zod";

import { text } from "./fields";

const POST_LINE = /^- \[(.+?)\]\((https?:\/\/[^\s)]+)\)(?::\s*(.*))?$/;
// Post pages only: drops feed links and the blog index that share the list shape.
const POST_PATH = /^\/blog\/([a-z0-9-]+)\/?$/;
// Also published as the slug `pattern` in the OpenAPI document and the MCP tool schema.
export const SLUG_PATTERN = "^[a-z0-9]+(?:-[a-z0-9]+)*$";
export const SLUG = new RegExp(SLUG_PATTERN);

// Shared by the REST `limit` param, the MCP tool schema and the OpenAPI document.
export const POSTS_LIMIT_MAX = 100;

const postFields = {
  title: text("Post title."),
  url: text("Canonical URL of the post.", { format: "uri" }),
  description: text("One-line summary of the post.")
};

export const PostSummary = z
  .object({
    slug: z.string().regex(SLUG).meta({ description: "Identifier to pass to getBlogPost." }),
    ...postFields
  })
  .meta({ title: "PostSummary", description: "A blog post without its body." });
export type PostSummary = z.infer<typeof PostSummary>;

export const PostList = z
  .object({
    posts: z.array(PostSummary).meta({ description: "Matching posts, newest first." }),
    count: z.int().min(0).meta({ description: "How many posts are in `posts`." })
  })
  .meta({ title: "PostList", description: "Response body of listBlogPosts." });

export const Post = z
  .object({
    slug: text("The post's slug."),
    ...postFields,
    markdown: text("The post's complete markdown source, frontmatter included.")
  })
  .meta({ title: "Post", description: "Response body of getBlogPost." });

export const isPostsLimit = (n: number): boolean =>
  Number.isInteger(n) && n >= 1 && n <= POSTS_LIMIT_MAX;

const SECTION_HEADING = "## Blog posts";

// Falls back to the whole document so renaming the heading cannot empty /api/posts.
function candidateLines(llmsTxt: string): string[] {
  const lines = llmsTxt.split("\n");
  const start = lines.findIndex(l => l.trim() === SECTION_HEADING);
  if (start === -1) return lines;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(l => l.startsWith("## "));
  return end === -1 ? rest : rest.slice(0, end);
}

export function parsePostList(llmsTxt: string): PostSummary[] {
  const posts: PostSummary[] = [];
  for (const line of candidateLines(llmsTxt)) {
    const match = line.trim().match(POST_LINE);
    if (!match) continue;
    const [, title, url, description] = match;
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      continue;
    }
    const slug = pathname.match(POST_PATH)?.[1];
    if (!slug) continue;
    posts.push({ slug, title, url, description: description?.trim() ?? "" });
  }
  return posts;
}

/** Case-insensitive substring match on title and description, then the first `limit`. */
export function searchPosts({
  posts,
  query,
  limit
}: {
  posts: PostSummary[];
  query?: string;
  limit?: number;
}): PostSummary[] {
  const needle = query?.trim().toLowerCase();
  const matches = needle
    ? posts.filter(
        p => p.title.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle)
      )
    : posts;
  return limit === undefined ? matches : matches.slice(0, limit);
}

// Built by src/pages/blog/[slug]/index.md.ts. The slug comes from the request path, so it is
// re-validated.
export function postMarkdownPath(slug: string): string | null {
  return SLUG.test(slug) ? `/blog/${slug}/index.md` : null;
}
