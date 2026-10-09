// Prerendered post list that the Worker reads via ASSETS (worker/api/store.ts) for the REST API
// and MCP, built from the same posts and descriptions as llms.txt. Not public: /api/* hits the
// Worker first.
import type { APIRoute } from "astro";

import { postSummaries } from "#content/posts.ts";
import { PostSummaries } from "#contracts/api/posts.ts";
import { getPostSources } from "#src/lib/blog/posts.ts";

export const GET = (async () => {
  const summaries = PostSummaries.parse(postSummaries(await getPostSources()));
  return new Response(JSON.stringify(summaries, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}) satisfies APIRoute;
