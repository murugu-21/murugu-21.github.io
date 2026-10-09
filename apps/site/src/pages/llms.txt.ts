// Site-wide llms.txt: the hand-written site summary plus every blog post.
import { siteLlmsText } from "@murugappan/content/llms.ts";
import { posts } from "virtual:content/posts";

import { textResponse } from "#src/lib/responses.ts";

export function GET() {
  return textResponse(siteLlmsText(posts));
}
