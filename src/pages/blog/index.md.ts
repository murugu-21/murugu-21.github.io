// Markdown rendition of the blog index for Accept: text/markdown (see the
// Transform Rule note in public/_headers).
import { blogIndexMarkdown, markdownResponse } from "../../lib/llms";

export async function GET() {
  return markdownResponse(await blogIndexMarkdown());
}
