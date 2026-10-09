import { blogLlmsText } from "#content/llms.ts";
import { getPostSources } from "#src/lib/blog/posts.ts";
import { textResponse } from "#src/lib/responses.ts";

export async function GET() {
  return textResponse(blogLlmsText(await getPostSources()));
}
