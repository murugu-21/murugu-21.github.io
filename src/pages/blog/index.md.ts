// Blog index as markdown.
import { blogIndexMarkdown } from "#content/llms.ts";
import { posts } from "virtual:content/posts";

import { markdownResponse } from "#src/lib/responses.ts";

export function GET() {
  return markdownResponse(blogIndexMarkdown(posts));
}
