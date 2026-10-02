// Site-wide llms.txt: the hand-written site summary plus every blog post.
import { siteLlmsText, textResponse } from "../lib/llms";

export async function GET() {
  return textResponse(await siteLlmsText());
}
