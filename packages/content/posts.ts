import type { BlogFrontmatter } from "@murugappan/contracts/blog.ts";
import { SLUG, type PostSummary } from "@murugappan/contracts/api/posts.ts";
import { SITE_ORIGIN } from "./site.ts";

export type PostSource = { slug: string; data: BlogFrontmatter; body: string };

export type ContentPost = PostSource & { markdown: string };

export const newestFirst = <T extends Pick<PostSource, "data">>(posts: T[]): T[] =>
  posts.toSorted((a, b) => b.data.date.getTime() - a.data.date.getTime());

export const postPath = (slug: string) => `/blog/${slug}/`;
export const postUrl = (slug: string) => `${SITE_ORIGIN}${postPath(slug)}`;

export function excerpt(body: string, length = 160): string {
  const text = body
    .replaceAll(/```[\s\S]*?```/g, " ")
    .replaceAll(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replaceAll(/[#>*`~]/g, "")
    .replaceAll(/(?<![\p{L}\p{N}_])_+|_+(?![\p{L}\p{N}_])/gu, "")
    .replaceAll(/\s+/g, " ")
    .trim();
  if (text.length <= length) return text;
  return text.slice(0, length).replace(/\s+\S*$/, "") + "…";
}

export const postDescription = (post: PostSource) => post.data.description || excerpt(post.body);

export const oneLineDescription = (post: PostSource) =>
  postDescription(post).replaceAll(/\s+/g, " ").trim();

export const postSummaries = (posts: PostSource[]): PostSummary[] =>
  newestFirst(posts)
    .filter(post => SLUG.test(post.slug))
    .map(post => ({
      slug: post.slug,
      title: post.data.title,
      url: postUrl(post.slug),
      description: oneLineDescription(post)
    }));
