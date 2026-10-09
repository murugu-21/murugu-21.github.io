// Bundles the Worker. The client build's output is the Worker's assets
// directory, so it points at the site's dist/ and leaves Astro's output as it is.
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite-plus";

import { contentPosts } from "@murugappan/content/vite/posts-plugin.ts";

export default defineConfig({
  plugins: [contentPosts(), cloudflare()],
  // The plugin builds the client, and keeps the assets binding, only when publicDir has files.
  publicDir: "../site/public",
  environments: {
    client: { build: { outDir: "../site/dist", emptyOutDir: false, copyPublicDir: false } }
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
