// Site-wide llms.txt: the hand-written site summary plus every blog post.
import { siteLlmsText } from "#content/llms.ts";
import { getPostSources } from "#src/lib/blog/posts.ts";
import { textResponse } from "#src/lib/responses.ts";

export async function GET() {
  return textResponse(siteLlmsText(await getPostSources()));
}
