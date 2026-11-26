import { defineConfig } from "vite-plus";
import { BUILD_ENV_NAMES } from "./build-env";

export default defineConfig({
  run: {
    tasks: {
      // A hit restores dist without deleting files it doesn't hold, so dist starts empty.
      clean: { command: "rm -rf dist", cache: false },
      github: { command: "bun scripts/fetch-github.ts", cache: false },
      build: {
        dependsOn: ["clean", "github"],
        // Astro loads env with an empty prefix, so Vite's report to vp would put every shell
        // variable in the cache key. Unsetting the client stops the report.
        command: "env -u VP_RUN_NODE_CLIENT_PATH astro build",
        cache: {
          // Astro and Vite write these during the build, so auto tracking would count them as inputs.
          input: [
            { auto: true },
            "!.astro/**",
            "!node_modules/.cache/**",
            "!node_modules/.vite/**",
            "!dist/**"
          ],
          // Write tracking misses files some integrations write, the sitemap among them.
          output: ["dist/**"],
          env: BUILD_ENV_NAMES,
          // Puppeteer falls back to /tmp without it, which agent-shell refuses.
          untrackedEnv: ["TMPDIR"]
        }
      }
    }
  }
});
