import { readFileSync } from "node:fs";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run on the Workers pool, which has no filesystem, and Vite's CSS
// pipeline swallows `?raw` for stylesheets. This config runs on the host
// (Bun), so read the stylesheets here and inline them — islands.css,
// global.css and the blog's prism-dark.css stay the one source of truth for
// the palettes, and src/styles/*.test.ts assert their contrast.
const islandsCss = readFileSync("./src/styles/islands.css", "utf8");
const globalCss = readFileSync("./src/styles/global.css", "utf8");
const prismCss = readFileSync("./src/blog/styles/prism-dark.css", "utf8");

// The pool's D1 starts empty and the chat mirrors are fire-and-forget: their
// writes would land in a logged .catch() rather than a table. Read the real
// ./migrations on the host for the same reason as the stylesheets, and let
// worker/test/apply-migrations.ts apply them once per test file.
const d1Migrations = await readD1Migrations("./migrations");

export default defineConfig({
  define: {
    __ISLANDS_CSS__: JSON.stringify(islandsCss),
    __GLOBAL_CSS__: JSON.stringify(globalCss),
    __PRISM_CSS__: JSON.stringify(prismCss),
    __D1_MIGRATIONS__: JSON.stringify(d1Migrations)
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./worker/test/wrangler.jsonc" }
    })
  ],
  test: {
    setupFiles: ["./worker/test/apply-migrations.ts"],
    include: ["worker/test/**/*.test.ts", "src/**/*.test.ts", "scripts/**/*.test.ts"]
  }
});
