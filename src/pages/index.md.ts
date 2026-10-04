// Homepage as markdown for Accept: text/markdown (see public/_headers); reuses the llms.txt summary.
import { markdownResponse, siteLlmsText } from "#src/lib/llms.ts";

export async function GET() {
  return markdownResponse(await siteLlmsText());
}
