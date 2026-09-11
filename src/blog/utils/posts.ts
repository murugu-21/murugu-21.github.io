import { getCollection, type CollectionEntry } from "astro:content";
import getReadingTime from "reading-time";

export type Post = CollectionEntry<"blog">;

// The flattened shape the blog index builds for PostList.astro / Post.astro
// (`description` stays undefined when a post has none, so the search falls
// back to the excerpt).
export interface SerializedPost {
  href: string;
  title: string;
  dateFormatted: string;
  minutes: number;
  tags: string[];
  description?: string;
  excerpt: string;
}

// All posts, sorted by date ASC (the order gatsby-node.js used to wire up
// previous/next links). Drafts (content/blog/draft/**) are excluded from
// production builds, matching the old gatsby-source-filesystem ignore rule.
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection(
    "blog",
    post => !(import.meta.env.PROD && post.id.startsWith("draft/"))
  );
  return posts.sort((a, b) => a.data.date.getTime() - b.data.date.getTime());
}

// Site-relative URL for a post, e.g. /blog/coin-change-problem/. Literal
// rather than import.meta.env.BASE_URL: the /blog prefix now comes from this
// route's position under src/pages/blog/, not from an Astro `base` setting.
export const postPath = (id: string) => `/blog/${id}/`;

// Matches Gatsby's date(formatString: "MMMM DD, YYYY"), e.g. "August 09, 2021"
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC"
  });
}

// Reading time in whole minutes from the raw markdown body (replaces
// Gatsby's MarkdownRemark.timeToRead).
export const timeToRead = (body: string | undefined) =>
  Math.max(1, Math.ceil(getReadingTime(body || "").minutes));

// Plain-text excerpt from the raw markdown body (replaces Gatsby's
// excerpt(pruneLength: 160)); used wherever frontmatter description is absent.
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
