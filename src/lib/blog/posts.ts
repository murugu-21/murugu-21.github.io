import { getCollection, type CollectionEntry } from "astro:content";
import getReadingTime from "reading-time";

import { SITE_ORIGIN } from "#content/site.ts";

export type Post = CollectionEntry<"blog">;

// What the blog index hands PostList/Post. `description` stays undefined when
// absent so search falls back to the excerpt.
export interface SerializedPost {
  href: string;
  title: string;
  dateFormatted: string;
  minutes: number;
  tags: string[];
  keywords: string[];
  description?: string;
  excerpt: string;
}

// Newest first. Drafts (content/blog/draft/**) are excluded in production.
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection(
    "blog",
    post => !(import.meta.env.PROD && post.id.startsWith("draft/"))
  );
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

// Literal /blog: the prefix comes from src/pages/blog/, not an Astro `base`.
export const postPath = (id: string) => `/blog/${id}/`;
export const postUrl = (id: string) => `${SITE_ORIGIN}${postPath(id)}`;

// Same URL the index's chips write (PostList.astro), so both land on one view.
export const tagPath = (tag: string) => `/blog/?tag=${encodeURIComponent(tag)}`;

// "MMMM DD, YYYY", e.g. "August 09, 2021".
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC"
  });
}

// Tags + keywords are one SEO vocabulary (`keywords` keeps precise terms off
// the filter chips); JSON-LD, OG article:tag and index search use the union.
export const postKeywords = (post: Post): string[] => [...post.data.tags, ...post.data.keywords];

// Whole minutes, at least 1.
export const timeToRead = (body: string | undefined) =>
  Math.max(1, Math.ceil(getReadingTime(body || "").minutes));

export function formatReadingTime(minutes: number): string {
  const cups = Math.round(minutes / 5);
  if (cups > 5) {
    return `${Array.from({ length: Math.round(cups / Math.E) }, () => "🍱").join("")} ${minutes} min read`;
  }
  return `${Array.from({ length: cups || 1 }, () => "☕️").join("")} ${minutes} min read`;
}

// Plain-text excerpt of the raw markdown, for posts without a description.
export function excerpt(body: string | undefined, length = 160): string {
  const text = (body || "")
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

export const postDescription = (post: Post) => post.data.description || excerpt(post.body);
