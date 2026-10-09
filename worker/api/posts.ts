import type { PostSummary } from "@murugappan/contracts/api/posts.ts";

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
