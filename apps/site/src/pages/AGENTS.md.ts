import guide from "@murugappan/content/agent-guide.md?raw";

import { markdownResponse } from "#src/lib/responses.ts";

export function GET() {
  return markdownResponse(guide);
}
