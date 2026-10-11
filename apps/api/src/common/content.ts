// The site content the Worker answers from, bundled at build time from the same sources the site
// builds from (packages/content/ and virtual:content/posts), so a deploy can't serve a stale copy.
// Repositories wrap the records; documents served verbatim (llms.txt, AGENTS.md) are read directly.
import { posts } from "virtual:content/posts";

import { siteDataset } from "@murugappan/content/dataset.ts";
import { blogLlmsFullText, siteLlmsText } from "@murugappan/content/llms.ts";
import { postSummaries } from "@murugappan/content/posts.ts";
import { Dataset } from "@murugappan/contracts/api/dataset.ts";

// Parsed at startup, so a dataset the schema rejects fails the deploy instead of every request.
export const DATASET = Dataset.parse(siteDataset());
export const POSTS = postSummaries(posts);
export const LLMS_TXT = siteLlmsText(posts);
export const LLMS_FULL_TXT = blogLlmsFullText(posts);
export { default as AGENTS_MD } from "@murugappan/content/agent-guide.md?raw";

export const POST_MARKDOWN: ReadonlyMap<string, string> = new Map(
  posts.map(post => [post.slug, post.markdown])
);
