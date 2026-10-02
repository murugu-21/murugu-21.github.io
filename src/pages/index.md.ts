// Markdown rendition of the homepage for Accept: text/markdown (see the
// Transform Rule note in public/_headers). The root llms.txt already is the
// site's markdown identity summary — serve it here and for /about/.
import { markdownResponse, siteLlmsText } from "../lib/llms";

export async function GET() {
  return markdownResponse(await siteLlmsText());
}
