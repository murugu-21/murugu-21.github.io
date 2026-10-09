import { join } from "node:path";

// The site package (apps/site), where astro runs and writes dist/.
export const ROOT = join(import.meta.dirname, "..");

// The built static site that `astro build` writes and wrangler serves as the Worker's assets.
export const SITE_DIR = join(ROOT, "dist");
