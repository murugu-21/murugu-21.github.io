// The site-wide LLM map: the hand-written site summary plus every blog post.
// Replaces the old static public/llms.txt + scripts/merge-llms.mjs pair, which
// could only append to the built file.
import { siteLlmsText, textResponse } from "../lib/llms";

export async function GET() {
  return textResponse(await siteLlmsText());
}
