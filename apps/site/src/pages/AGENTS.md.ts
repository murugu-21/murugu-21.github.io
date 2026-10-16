import { agentGuide } from "@murugappan/content/agent-docs.ts";

import { markdownResponse } from "#src/lib/responses.ts";

export function GET() {
  return markdownResponse(agentGuide());
}
