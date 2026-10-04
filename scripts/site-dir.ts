import { fileURLToPath } from "node:url";

// Built static assets: @astrojs/cloudflare writes the site into the Build
// Output that `cf deploy --prebuilt` uploads.
export const SITE_DIR = fileURLToPath(
  new URL("../.cloudflare/output/v0/workers/default/assets", import.meta.url)
);
