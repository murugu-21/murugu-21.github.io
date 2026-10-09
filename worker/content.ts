// The site content the Worker answers from, bundled at build time from the same sources the site
// builds from (content/ and virtual:content/posts), so a deploy can't serve a stale copy.
import { posts } from "virtual:content/posts";

import { siteDataset } from "#content/dataset.ts";
import { blogLlmsFullText, siteLlmsText } from "#content/llms.ts";
import { postSummaries } from "#content/posts.ts";
import { Dataset } from "#contracts/api/dataset.ts";
import type { PostSummary } from "#contracts/api/posts.ts";

// Parsed at startup, so a dataset the schema rejects fails the deploy instead of every request.
export const DATASET = Dataset.parse(siteDataset());
export const POSTS = postSummaries(posts);
export const LLMS_TXT = siteLlmsText(posts);
export const LLMS_FULL_TXT = blogLlmsFullText(posts);
export { default as AGENTS_MD } from "#public/AGENTS.md?raw";

const MARKDOWN = new Map(posts.map(post => [post.slug, post.markdown]));

/** A listed post with its markdown source, frontmatter included. */
export function findPost(slug: string): (PostSummary & { markdown: string }) | undefined {
  const post = POSTS.find(p => p.slug === slug);
  const markdown = MARKDOWN.get(slug);
  return post && markdown !== undefined ? { ...post, markdown } : undefined;
}
