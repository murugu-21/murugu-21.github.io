import type { BlogFrontmatter } from "#contracts/blog.ts";
import { SLUG, type PostSummary } from "#contracts/api/posts.ts";
import { SITE_ORIGIN } from "./site.ts";

// A post from content/blog/<slug>/index.md: `data` is its parsed frontmatter and `body` the
// markdown after it.
export type PostSource = { slug: string; data: BlogFrontmatter; body: string };

/** A published post as `virtual:content/posts` serves it: `markdown` is the whole file. */
export type ContentPost = PostSource & { markdown: string };

export const newestFirst = <T extends Pick<PostSource, "data">>(posts: T[]): T[] =>
  posts.toSorted((a, b) => b.data.date.getTime() - a.data.date.getTime());

// Literal /blog: the site's prefix comes from src/pages/blog/, not an Astro `base`.
export const postPath = (slug: string) => `/blog/${slug}/`;
export const postUrl = (slug: string) => `${SITE_ORIGIN}${postPath(slug)}`;

// Plain-text excerpt of the raw markdown, for posts without a description.
export function excerpt(body: string, length = 160): string {
  const text = body
    .replaceAll(/```[\s\S]*?```/g, " ")
    .replaceAll(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replaceAll(/[#>*`~]/g, "")
    // Emphasis underscores only: one inside a word (event_type) is text.
    .replaceAll(/(?<![\p{L}\p{N}_])_+|_+(?![\p{L}\p{N}_])/gu, "")
    .replaceAll(/\s+/g, " ")
    .trim();
  if (text.length <= length) return text;
  return text.slice(0, length).replace(/\s+\S*$/, "") + "…";
}

export const postDescription = (post: PostSource) => post.data.description || excerpt(post.body);

// llms.txt entries are line-based; a multi-line frontmatter description would break them.
export const oneLineDescription = (post: PostSource) =>
  postDescription(post).replaceAll(/\s+/g, " ").trim();

// Newest first, and only slugs the API accepts, so a directory name outside SLUG never reaches
// a PostSummary.
export const postSummaries = (posts: PostSource[]): PostSummary[] =>
  newestFirst(posts)
    .filter(post => SLUG.test(post.slug))
    .map(post => ({
      slug: post.slug,
      title: post.data.title,
      url: postUrl(post.slug),
      description: oneLineDescription(post)
    }));
