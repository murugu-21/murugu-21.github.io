// Markdown rendition of /about/, the canonical entity page: the same site
// summary as the homepage's (see ../index.md.ts).
import { markdownResponse, siteLlmsText } from "../../lib/llms";

export async function GET() {
  return markdownResponse(await siteLlmsText());
}
