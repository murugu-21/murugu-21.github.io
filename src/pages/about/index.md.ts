// /about/ as markdown: the same site summary as ../index.md.ts.
import { siteLlmsText } from "#content/llms.ts";
import { posts } from "virtual:content/posts";

import { markdownResponse } from "#src/lib/responses.ts";

export function GET() {
  return markdownResponse(siteLlmsText(posts));
}
