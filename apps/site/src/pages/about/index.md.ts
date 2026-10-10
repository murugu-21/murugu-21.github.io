import { aboutMarkdown } from "@murugappan/content/profile-markdown.ts";

import { markdownResponse } from "#src/lib/responses.ts";

export function GET() {
  return markdownResponse(aboutMarkdown());
}
