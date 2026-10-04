import { join } from "node:path";

// The built static site. @astrojs/cloudflare writes it into the Build Output
// that `cf deploy --prebuilt` uploads.
export const SITE_DIR = join(
  import.meta.dirname,
  "../.cloudflare/output/v0/workers/default/assets"
);
