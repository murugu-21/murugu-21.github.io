import { getCollection, type CollectionEntry } from "astro:content";
import getReadingTime from "reading-time";

import { newestFirst, type PostSource } from "#content/posts.ts";

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
  return newestFirst(posts);
}

export const toPostSource = ({ id, data, body }: Post): PostSource => ({
  slug: id,
  data,
  body: body ?? ""
});

export const getPostSources = async () => (await getPublishedPosts()).map(toPostSource);

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
export const postKeywords = (post: PostSource): string[] => [
  ...post.data.tags,
  ...post.data.keywords
];

// Whole minutes, at least 1.
export const timeToRead = (body: string) => Math.max(1, Math.ceil(getReadingTime(body).minutes));

export function formatReadingTime(minutes: number): string {
  const cups = Math.round(minutes / 5);
  if (cups > 5) {
    return `${Array.from({ length: Math.round(cups / Math.E) }, () => "🍱").join("")} ${minutes} min read`;
  }
  return `${Array.from({ length: cups || 1 }, () => "☕️").join("")} ${minutes} min read`;
}
