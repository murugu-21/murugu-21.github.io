import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { preview } from "vite-plus";
import type { TestProject } from "vite-plus/test/node";

declare module "vitest" {
  export interface ProvidedContext {
    origin: string;
  }
}

const API_DIR = fileURLToPath(new URL("..", import.meta.url));
// Without it the Worker would read .dev.vars, with its real DeepSeek key and analytics token.
const E2E_VARS = join(API_DIR, ".dev.vars.e2e");
const BUILD_OUTPUT = [
  join(API_DIR, ".cloudflare/output/v0/workers/default/worker.config.json"),
  join(API_DIR, "../site/dist/index.html")
];

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const missing = BUILD_OUTPUT.filter(file => !existsSync(file));
  if (missing.length > 0) {
    throw new Error(`No build output at ${missing.join(", ")}. Run bun run build first.`);
  }
  if (!existsSync(E2E_VARS)) throw new Error(`${E2E_VARS} is missing.`);

  const server = await preview({
    root: API_DIR,
    mode: "e2e",
    logLevel: "warn",
    preview: { port: 0, strictPort: false }
  });
  const stop = () => server.close();

  const url = server.resolvedUrls?.local[0];
  if (url === undefined) {
    await stop();
    throw new Error("vite preview started without a local URL");
  }
  project.provide("origin", new URL(url).origin);
  return stop;
}
