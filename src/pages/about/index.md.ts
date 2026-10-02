// /about/ as markdown: the same site summary as ../index.md.ts.
import { markdownResponse, siteLlmsText } from "../../lib/llms";

export async function GET() {
  return markdownResponse(await siteLlmsText());
}
