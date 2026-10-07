// Each post's markdown source, frontmatter included, for Accept: text/markdown
// (see public/_headers). Published top-level posts only, so drafts never leak.
import { readFileSync } from "node:fs";
import type { APIRoute, GetStaticPaths, InferGetStaticPropsType } from "astro";

import { getPublishedPosts } from "#src/lib/blog/posts.ts";
import { markdownResponse } from "#src/lib/llms.ts";

export const getStaticPaths = (async () => {
  const posts = await getPublishedPosts();
  return posts.flatMap(({ id, filePath }) =>
    !id.includes("/") && filePath ? [{ params: { slug: id }, props: { filePath } }] : []
  );
}) satisfies GetStaticPaths;

export const GET: APIRoute<InferGetStaticPropsType<typeof getStaticPaths>> = ({ props }) =>
  markdownResponse(readFileSync(props.filePath, "utf8"));
