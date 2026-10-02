import { fileURLToPath } from "node:url";

// Built static assets (@astrojs/cloudflare writes them to dist/client; the
// Worker goes to dist/server).
export const SITE_DIR = fileURLToPath(new URL("../dist/client", import.meta.url));
