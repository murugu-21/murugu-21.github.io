// Bundles the Worker. The client build's output is the Worker's assets
// directory, so it points at the site's dist/ and leaves Astro's output as it is.
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite-plus";

import { contentPosts } from "@murugappan/content/vite/posts-plugin.ts";

export default defineConfig({
  plugins: [contentPosts(), cloudflare({ viteEnvironment: { name: "worker" } })],
  // The plugin builds the client, and keeps the assets binding, only when publicDir has files.
  publicDir: "../site/public",
  environments: {
    client: { build: { outDir: "../site/dist", emptyOutDir: false, copyPublicDir: false } },
    // Vite leaves server environments unminified. Source maps (which the plugin uploads on
    // deploy) stay out of the client build, whose output is public. keepNames because the
    // agents SDK logs and sends `constructor.name`, and MCP errors take their name from it.
    worker: {
      build: { minify: true, sourcemap: true, rolldownOptions: { output: { keepNames: true } } }
    }
  },
  build: { outDir: "dist-worker" },
  server: { port: 8787, strictPort: true },
  // The Worker serves the site's build as its assets, so the site builds first. Uncached: the
  // output feeds a deploy.
  run: {
    tasks: {
      build: { command: "vp build", dependsOn: ["@murugappan/site#build"], cache: false }
    }
  }
});
