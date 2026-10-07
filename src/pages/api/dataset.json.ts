// Prerendered dataset the Worker reads via ASSETS (worker/api/store.ts), so the
// API and pages share one source. The Worker can't import portfolio.ts itself
// (it imports .png files as ImageMetadata). Not public: /api/* hits the Worker first.
import type { APIRoute } from "astro";

import { buildDataset, Dataset } from "#worker/api/dataset.ts";
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
} from "#src/data/portfolio.ts";
import { resumeContact } from "#src/data/resume.ts";

export const GET: APIRoute = () => {
  const json = JSON.stringify(
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
  );
  // Validates the serialized bytes the Worker reads (NaN becomes null on the way), so a dataset
  // the Worker would answer 503 for fails the build instead.
  Dataset.parse(JSON.parse(json));
  return new Response(json, { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
