import { RESUME_PHONE } from "astro:env/server";
import { pinnedRepos } from "virtual:github-snapshot";
import { resumeMarkdown } from "@murugappan/content/profile-markdown.ts";

import { resumeProjects } from "#src/lib/github.ts";
import { markdownResponse } from "#src/lib/responses.ts";

export function GET() {
  return markdownResponse(
    resumeMarkdown({ phone: RESUME_PHONE, projects: resumeProjects(pinnedRepos) })
  );
}
