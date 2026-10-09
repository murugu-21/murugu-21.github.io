// Builds the Worker (`main` in wrangler.jsonc). Run it after `astro build`: the plugin makes the
// client build the Worker's assets directory, so the client build is pointed at Astro's dist/
// and told to leave Astro's output, public/ copies included, as it is.
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [cloudflare()],
  environments: {
    client: { build: { outDir: "dist", emptyOutDir: false, copyPublicDir: false } }
  },
  build: { outDir: "dist-worker" }
});
