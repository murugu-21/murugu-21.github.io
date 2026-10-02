// Markdown rendition of each post for Accept: text/markdown (see the
// Transform Rule note in public/_headers): the real markdown source,
// frontmatter included — the same shape as Cloudflare's converter output.
// Only published, top-level posts get one, so drafts (content/blog/draft/)
// never leak.
import { readFileSync } from "node:fs";
import type { APIRoute, GetStaticPaths } from "astro";

import { getPublishedPosts } from "../../../blog/utils/posts";
import { markdownResponse } from "../../../lib/llms";

export const getStaticPaths = (async () => {
  const posts = await getPublishedPosts();
  return posts
    .filter(post => !post.id.includes("/") && post.filePath)
    .map(post => ({ params: { slug: post.id }, props: { filePath: post.filePath! } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => markdownResponse(readFileSync(props.filePath, "utf8"));
