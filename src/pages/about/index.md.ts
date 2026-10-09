// /about/ as markdown: the same site summary as ../index.md.ts.
import { siteLlmsText } from "#content/llms.ts";
import { getPostSources } from "#src/lib/blog/posts.ts";
import { markdownResponse } from "#src/lib/responses.ts";

export async function GET() {
  return markdownResponse(siteLlmsText(await getPostSources()));
}
