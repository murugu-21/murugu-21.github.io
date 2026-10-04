// /about/ as markdown: the same site summary as ../index.md.ts.
import { markdownResponse, siteLlmsText } from "#src/lib/llms.ts";

export async function GET() {
  return markdownResponse(await siteLlmsText());
}
