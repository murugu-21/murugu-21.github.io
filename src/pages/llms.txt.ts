// The site-wide LLM map: the hand-written site summary plus every blog post.
// Replaces the old static public/llms.txt + scripts/merge-llms.mjs pair, which
// could only append to the built file. The preamble is a .txt imported ?raw
// rather than a TS template literal — it contains backticks.
import LLMS_PREAMBLE from "../data/llms-preamble.txt?raw";
import {postLines} from "../blog/utils/llms";

export async function GET() {
  const body = `${LLMS_PREAMBLE.trimEnd()}\n\n## Blog posts\n${(
    await postLines()
  ).join("\n")}\n`;
  return new Response(body, {
    headers: {"Content-Type": "text/plain; charset=utf-8"}
  });
}
