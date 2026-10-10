import { RESUME_PHONE } from "astro:env/server";
import { resumeMarkdown } from "@murugappan/content/profile-markdown.ts";

import { fetchResumeProjects } from "#src/lib/github.ts";
import { markdownResponse } from "#src/lib/responses.ts";

export async function GET() {
  return markdownResponse(
    resumeMarkdown({ phone: RESUME_PHONE, projects: await fetchResumeProjects() })
  );
}
