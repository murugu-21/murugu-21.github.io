import { posts } from "virtual:content/posts";

import { agentGuide } from "@murugappan/content/agent-docs.ts";
import { siteDataset } from "@murugappan/content/dataset.ts";
import { blogLlmsFullText, siteLlmsText } from "@murugappan/content/llms.ts";
import { postSummaries } from "@murugappan/content/posts.ts";
import { Dataset } from "@murugappan/contracts/api/dataset.ts";

export const DATASET = Dataset.parse(siteDataset());
export const POSTS = postSummaries(posts);
export const LLMS_TXT = siteLlmsText(posts);
export const LLMS_FULL_TXT = blogLlmsFullText(posts);
export const AGENTS_MD = agentGuide();

export const POST_MARKDOWN: ReadonlyMap<string, string> = new Map(
  posts.map(post => [post.slug, post.markdown])
);
