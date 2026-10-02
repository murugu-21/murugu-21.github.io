import { fileURLToPath } from "node:url";

// Where `bun run build` leaves the built site. Scripts that read the build
// (audio, live test capture) or post-process it (the resume PDF) resolve it
// from here, so a move — the cf CLI's Build Output puts the assets under
// .cloudflare/output/v0/workers/default/assets — is a one-line change.
export const SITE_DIR = fileURLToPath(new URL("../dist", import.meta.url));
