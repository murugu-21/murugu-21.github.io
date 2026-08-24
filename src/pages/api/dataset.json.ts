// Build artifact backing the public API. Prerendered to dist/api/dataset.json
// and read back by the Worker through the ASSETS binding (worker/api/store.ts)
// — so /api/profile, the rendered pages and the resume PDF are all projections
// of src/data/portfolio.ts and can never disagree with each other.
//
// The Worker cannot import portfolio.ts directly: it types its company logos
// as Astro `ImageMetadata` and imports .png files, neither of which survives
// outside the Astro/Vite pipeline. buildDataset() lives in worker/api so the
// shape stays owned by the API and stays covered by the Worker's tests.
//
// Not a public endpoint: the Worker claims /api/* ahead of static assets, so a
// request for /api/dataset.json gets the JSON 404. Consume it via /api/profile
// and friends.
import type {APIRoute} from "astro";

import {buildDataset} from "../../../worker/api/dataset";
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
import {resumeContact} from "../../data/resume";

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
        techStack,
        educationInfo,
        openSourceCard,
        isHireable
      }),
      null,
      2
    ),
    {headers: {"Content-Type": "application/json; charset=utf-8"}}
  );
