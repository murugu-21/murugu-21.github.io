// Prerendered post list that the Worker reads via ASSETS (worker/api/store.ts) for the REST API
// and MCP, built from the same posts and descriptions as llms.txt. Not public: /api/* hits the
// Worker first.
import type { APIRoute } from "astro";

import { PostSummaries, SLUG } from "#contracts/api/posts.ts";
import { getPublishedPosts, postUrl } from "#src/lib/blog/posts.ts";
import { oneLineDescription } from "#src/lib/llms.ts";

export const GET = (async () => {
  const posts = await getPublishedPosts();
  // Only ids the API accepts as slugs: a nested draft/… id (dev only) has no index.md rendition.
  const summaries = PostSummaries.parse(
    posts
      .filter(post => SLUG.test(post.id))
      .map(post => ({
        slug: post.id,
        title: post.data.title,
        url: postUrl(post.id),
        description: oneLineDescription(post)
      }))
  );
  return new Response(JSON.stringify(summaries, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}) satisfies APIRoute;
