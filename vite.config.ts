import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite-plus";

import lint from "./lint.config.ts";
import { contentPosts } from "@murugappan/content/vite/posts-plugin.ts";

export default defineConfig({
  // `vp build` bundles the Worker (`main` in wrangler.jsonc). Run it after `astro build`: the
  // plugin makes the client build the Worker's assets directory, so the client build is pointed
  // at Astro's dist/ and told to leave Astro's output, public/ copies included, as it is.
  plugins: [contentPosts(), cloudflare()],
  environments: {
    client: { build: { outDir: "dist", emptyOutDir: false, copyPublicDir: false } }
  },
  build: { outDir: "dist-worker" },
  lint,
  fmt: {
    trailingComma: "none",
    arrowParens: "avoid",
    printWidth: 100,
    sortPackageJson: false,
    sortTailwindcss: { stylesheet: "./src/styles/global.css", functions: ["cn", "cva"] },
    overrides: [
      { files: ["packages/content/**/*.md"], options: { semi: false, trailingComma: "all" } }
    ]
  },
  staged: {
    "*.{js,mjs,jsx,ts,tsx}": ["vp lint --fix", "vp fmt"],
    "*.{json,jsonc,md}": "vp fmt",
    "*.css": ["bun run lint:eslint --fix", "vp fmt"],
    "*.astro": ["bun run lint:eslint --fix", "prettier --write"],
    "*.py": ["bun run --silent py ruff check --fix", "bun run --silent py ruff format"]
  }
});
