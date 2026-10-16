import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..");

export const SITE_DIR = join(ROOT, "dist");
