// Blog index as markdown for Accept: text/markdown (see public/_headers).
import { blogIndexMarkdown, markdownResponse } from "#src/lib/llms.ts";

export async function GET() {
  return markdownResponse(await blogIndexMarkdown());
}
