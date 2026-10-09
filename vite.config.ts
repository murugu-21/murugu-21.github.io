import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite-plus";

import lint from "./lint.config.ts";
import { contentPosts } from "@murugappan/content/vite/posts-plugin.ts";

export default defineConfig({
  // `vp build` bundles the Worker (`main` in wrangler.jsonc). Run it after `astro build`: the
  // plugin makes the client build the Worker's assets directory, so the client build is pointed
  // at Astro's dist/ and told to leave Astro's output, public/ copies included, as it is.
  // The plugin only builds the client, and so only keeps the Worker's assets binding, when
  // publicDir has files, so publicDir names the site's public/.
  plugins: [contentPosts(), cloudflare()],
  publicDir: "apps/site/public",
  environments: {
    client: { build: { outDir: "apps/site/dist", emptyOutDir: false, copyPublicDir: false } }
  },
  build: { outDir: "dist-worker" },
  lint,
  fmt: {
    ignorePatterns: ["apps/site/public/**"],
    trailingComma: "none",
    arrowParens: "avoid",
    printWidth: 100,
    sortPackageJson: false,
    sortTailwindcss: { stylesheet: "./apps/site/src/styles/global.css", functions: ["cn", "cva"] },
    overrides: [
      { files: ["packages/content/**/*.md"], options: { semi: false, trailingComma: "all" } }
    ]
  },
  // The flag keeps a commit that only touches ignored files (apps/site/public) from failing.
  staged: {
    "*.{js,mjs,jsx,ts,tsx}": [
      "vp lint --fix --no-error-on-unmatched-pattern",
      "vp fmt --no-error-on-unmatched-pattern"
    ],
    "*.{json,jsonc,md}": "vp fmt --no-error-on-unmatched-pattern",
    "*.css": ["bun run lint:eslint --fix", "vp fmt --no-error-on-unmatched-pattern"],
    "*.astro": ["bun run lint:eslint --fix", "prettier --write"],
    "*.py": ["bun run --silent py ruff check --fix", "bun run --silent py ruff format"]
  }
});
