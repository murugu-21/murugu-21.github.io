// The agent guide. The Worker's MCP server serves the same file as a resource.
import guide from "@murugappan/content/agent-guide.md?raw";

import { markdownResponse } from "#src/lib/responses.ts";

export function GET() {
  return markdownResponse(guide);
}
