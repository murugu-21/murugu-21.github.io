// Builds the Worker (`main` in wrangler.jsonc). Run it after `astro build`: the plugin makes the
// client build the Worker's assets directory, so the client build is pointed at Astro's dist/
// and told to leave Astro's output, public/ copies included, as it is.
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

import { contentPosts } from "./scripts/content/posts-plugin.ts";

export default defineConfig({
  plugins: [contentPosts(), cloudflare()],
  environments: {
    client: { build: { outDir: "dist", emptyOutDir: false, copyPublicDir: false } }
  },
  build: { outDir: "dist-worker" }
});
