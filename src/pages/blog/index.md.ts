// Blog index as markdown.
import { blogIndexMarkdown, markdownResponse } from "#src/lib/llms.ts";

export async function GET() {
  return markdownResponse(await blogIndexMarkdown());
}
