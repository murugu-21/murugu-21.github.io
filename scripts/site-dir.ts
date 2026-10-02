import { fileURLToPath } from "node:url";

// Where `bun run build` leaves the built site: @astrojs/cloudflare writes the
// static assets to dist/client (the Worker goes to dist/server). Scripts that
// read the build (audio, live test capture) or post-process it (the resume
// PDF) resolve it from here, so a move — the cf CLI's Build Output puts the
// assets under .cloudflare/output/v0/workers/default/assets — is a one-line
// change.
export const SITE_DIR = fileURLToPath(new URL("../dist/client", import.meta.url));
