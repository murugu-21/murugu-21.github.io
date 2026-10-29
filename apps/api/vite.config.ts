// Not in the root vite.config.ts, whose plugins would load into the workerd test pool.
import { cloudflare, type PluginConfig } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite-plus";

import { contentPosts } from "@murugappan/content/vite/posts-plugin.ts";

type LocalWorker = { envDir?: string; persistState: PluginConfig["persistState"] };

// A preview reads .dev.vars for the build's mode, never the preview's, so e2e (dummy keys) and
// the verify-murugappan-dev skill (a test Turnstile secret) each get an envDir of their own.
function localWorker(mode: string): LocalWorker {
  if (mode === "e2e") return { envDir: "e2e", persistState: false };
  if (mode === "verify") {
    return { envDir: ".cloudflare/verify", persistState: { path: ".cloudflare/verify/state" } };
  }
  return { persistState: true };
}

export default defineConfig(({ command, mode }) => {
  const { envDir, persistState } = localWorker(mode);
  return {
    envDir,
    plugins: [contentPosts(), cloudflare({ viteEnvironment: { name: "worker" }, persistState })],
    // The plugin keeps the assets binding only when publicDir has files.
    publicDir: command === "build" ? "../site/dist" : "../site/public",
    environments: {
      // Vite leaves server environments unminified. Source maps (which the plugin uploads on
      // deploy) stay out of the client build, whose output is public. keepNames because the
      // agents SDK logs and sends `constructor.name`, and MCP errors take their name from it.
      worker: {
        build: { minify: true, sourcemap: true, rolldownOptions: { output: { keepNames: true } } }
      }
    },
    server: { port: 8787, strictPort: true },
    preview: { port: 8787, strictPort: true },
    run: { tasks: { build: { command: "vp build", dependsOn: ["@murugappan/site#build"] } } }
  };
});
