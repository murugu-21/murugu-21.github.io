// Blog index as markdown.
import { blogIndexMarkdown } from "#content/llms.ts";
import { getPostSources } from "#src/lib/blog/posts.ts";
import { markdownResponse } from "#src/lib/responses.ts";

export async function GET() {
  return markdownResponse(blogIndexMarkdown(await getPostSources()));
}
