// Site-wide llms.txt: the hand-written site summary plus every blog post.
import { siteLlmsText, textResponse } from "#src/lib/llms.ts";

export async function GET() {
  return textResponse(await siteLlmsText());
}
