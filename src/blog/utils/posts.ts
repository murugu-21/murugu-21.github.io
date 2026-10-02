import { getCollection, type CollectionEntry } from "astro:content";
import getReadingTime from "reading-time";

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

// Date ascending. Drafts (content/blog/draft/**) are excluded in production.
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection(
    "blog",
    post => !(import.meta.env.PROD && post.id.startsWith("draft/"))
  );
  return posts.sort((a, b) => a.data.date.getTime() - b.data.date.getTime());
}

// Literal /blog: the prefix comes from src/pages/blog/, not an Astro `base`.
export const postPath = (id: string) => `/blog/${id}/`;

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

// Plain-text excerpt of the raw markdown, for posts without a description.
export function excerpt(body: string | undefined, length = 160): string {
  const text = (body || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= length) return text;
  return text.slice(0, length).replace(/\s+\S*$/, "") + "…";
}
