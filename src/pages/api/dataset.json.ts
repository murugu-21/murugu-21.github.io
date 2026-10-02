// Prerendered dataset the Worker reads via ASSETS (worker/api/store.ts), so the
// API and pages share one source. The Worker can't import portfolio.ts itself
// (it imports .png files as ImageMetadata). Not public: /api/* hits the Worker first.
import type { APIRoute } from "astro";

import { buildDataset } from "../../../worker/api/dataset";
import {
  educationInfo,
  greeting,
  isHireable,
  openSourceCard,
  skillsCategories,
  skillsSection,
  socialMediaLinks,
  techStack,
  workExperiences
} from "../../data/portfolio";
import { resumeContact } from "../../data/resume";

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      buildDataset({
        greeting,
        resumeContact,
        socialMediaLinks,
        workExperiences,
        skillsSection,
        skillsCategories,
        // the API lists tool names only; icon keys are a rendering concern
        techStack: {
          experience: techStack.experience.map(e => ({
            ...e,
            tools: e.tools.map(t => t.name)
          }))
        },
        educationInfo,
        openSourceCard,
        isHireable
      }),
      null,
      2
    ),
    { headers: { "Content-Type": "application/json; charset=utf-8" } }
  );
