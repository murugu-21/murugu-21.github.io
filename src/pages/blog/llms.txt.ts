import { blogLlmsText } from "#content/llms.ts";
import { posts } from "virtual:content/posts";

import { textResponse } from "#src/lib/responses.ts";

export function GET() {
  return textResponse(blogLlmsText(posts));
}
