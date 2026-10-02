// Each post's markdown source, frontmatter included, for Accept: text/markdown
// (see public/_headers). Published top-level posts only, so drafts never leak.
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
