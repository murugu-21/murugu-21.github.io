import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..");

// The built static site. @astrojs/cloudflare writes it into the Build Output
// that `cf deploy --prebuilt` uploads.
export const SITE_DIR = join(ROOT, ".cloudflare/output/v0/workers/default/assets");
