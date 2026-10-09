// `vp build` bundles the Worker (`main` in wrangler.jsonc). It runs after the site's build: the
// plugin makes the client build the Worker's assets directory, so the client build is pointed at
// the site's dist/ and told to leave Astro's output, public/ copies included, as it is. The
// plugin only builds the client, and so only keeps the Worker's assets binding, when publicDir
// has files, so publicDir names the site's public/.
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite-plus";

import { contentPosts } from "@murugappan/content/vite/posts-plugin.ts";

export default defineConfig({
  plugins: [contentPosts(), cloudflare()],
  publicDir: "../site/public",
  environments: {
    client: { build: { outDir: "../site/dist", emptyOutDir: false, copyPublicDir: false } }
  },
  build: { outDir: "dist-worker" },
  // The Worker serves the site's build as its assets, so the site builds first. Uncached: the
  // output feeds a deploy.
  run: {
    tasks: {
      build: { command: "vp build", dependsOn: ["@murugappan/site#build"], cache: false }
    }
  }
});
