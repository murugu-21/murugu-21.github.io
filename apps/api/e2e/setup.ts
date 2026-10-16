import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vite-plus/test/node";
import { unstable_startWorker } from "wrangler";

declare module "vitest" {
  export interface ProvidedContext {
    origin: string;
  }
}

const ANALYTICS_OFF = "";

const API_DIR = fileURLToPath(new URL("..", import.meta.url));
const WORKER_CONFIG = join(API_DIR, "dist-worker/worker/wrangler.json");
const BUILD_OUTPUT = [WORKER_CONFIG, join(API_DIR, "../site/dist/index.html")];

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const missing = BUILD_OUTPUT.filter(file => !existsSync(file));
  if (missing.length > 0) {
    throw new Error(`No build output at ${missing.join(", ")}. Run bun run build first.`);
  }

  const state = await mkdtemp(join(tmpdir(), "murugappan-dev-e2e-"));
  const worker = await unstable_startWorker({
    config: WORKER_CONFIG,
    bindings: {
      POSTHOG_PROJECT_TOKEN: { type: "secret_text", value: ANALYTICS_OFF },
      DEEPSEEK_API_KEY: { type: "secret_text", value: "e2e-dummy" }
    },
    dev: { server: { port: 0 }, inspector: false, persist: state, logLevel: "warn" }
  });
  const stop = async () => {
    await worker.dispose();
    await rm(state, { recursive: true, force: true });
  };

  try {
    await worker.ready;
    project.provide("origin", (await worker.url).origin);
  } catch (error) {
    await stop();
    throw error;
  }
  return stop;
}
