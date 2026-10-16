import { getCollection, type CollectionEntry } from "astro:content";
import getReadingTime from "reading-time";

import { newestFirst, type PostSource } from "@murugappan/content/posts.ts";

export type Post = CollectionEntry<"blog">;

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

export const tagPath = (tag: string) => `/blog/?tag=${encodeURIComponent(tag)}`;

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC"
  });
}

export const postKeywords = (post: PostSource): string[] => [
  ...post.data.tags,
  ...post.data.keywords
];

export const timeToRead = (body: string) => Math.max(1, Math.ceil(getReadingTime(body).minutes));

export function formatReadingTime(minutes: number): string {
  const cups = Math.round(minutes / 5);
  if (cups > 5) {
    return `${Array.from({ length: Math.round(cups / Math.E) }, () => "🍱").join("")} ${minutes} min read`;
  }
  return `${Array.from({ length: cups || 1 }, () => "☕️").join("")} ${minutes} min read`;
}
