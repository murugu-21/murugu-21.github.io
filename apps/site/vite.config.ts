import { defineConfig } from "vite-plus";
import { BUILD_ENV_NAMES } from "./build-env";

export default defineConfig({
  run: {
    tasks: {
      // A hit restores dist without deleting files it doesn't hold, so dist starts empty.
      clean: { command: "rm -rf dist", cache: false },
      build: {
        dependsOn: ["clean"],
        // Astro loads env with an empty prefix, so Vite's report to vp would put every shell
        // variable in the cache key. Unsetting the client stops the report.
        command: "env -u VP_RUN_NODE_CLIENT_PATH astro build",
        cache: {
          // The build writes back to these caches, and reads dist after writing it.
          input: [
            { auto: true },
            "!.astro/**",
            "!node_modules/.cache/**",
            "!node_modules/.vite/**",
            "!dist/**"
          ],
          // Write tracking misses files some integrations write, sitemap.xml among them.
          output: ["dist/**"],
          // The task sees only these and vp's passthrough. The GitHub card is fetched, so a hit
          // keeps the card it was cached with.
          env: BUILD_ENV_NAMES
        }
      }
    }
  }
});
