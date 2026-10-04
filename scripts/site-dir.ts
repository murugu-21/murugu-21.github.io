import { join } from "node:path";

// Built static assets: @astrojs/cloudflare writes the site into the Build
// Output that `cf deploy --prebuilt` uploads.
export const SITE_DIR = join(
  import.meta.dirname,
  "../.cloudflare/output/v0/workers/default/assets"
);
