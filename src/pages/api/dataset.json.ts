// Prerendered dataset (content/dataset.ts builds it) that the Worker reads via ASSETS
// (worker/api/store.ts), so the API and pages share one source. Not public: /api/* hits the
// Worker first.
import type { APIRoute } from "astro";

import { siteDataset } from "#content/dataset.ts";
import { Dataset } from "#contracts/api/dataset.ts";

export const GET = (() => {
  const json = JSON.stringify(siteDataset(), null, 2);
  // Validates the serialized bytes the Worker reads (NaN becomes null on the way), so a dataset
  // the Worker would answer 503 for fails the build instead.
  Dataset.parse(JSON.parse(json));
  return new Response(json, { headers: { "Content-Type": "application/json; charset=utf-8" } });
}) satisfies APIRoute;
