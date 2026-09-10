import { readFileSync } from "node:fs";

import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run on the Workers pool, which has no filesystem, and Vite's CSS
// pipeline swallows `?raw` for stylesheets. This config runs in Node, so read
// the island tokens here and inline them — islands.css stays the one source of
// truth for the palette, and src/styles/islands.test.ts asserts its contrast.
const islandsCss = readFileSync("./src/styles/islands.css", "utf8");

export default defineConfig({
  define: { __ISLANDS_CSS__: JSON.stringify(islandsCss) },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./worker/test/wrangler.jsonc" }
    })
  ],
  test: {
    include: ["worker/test/**/*.test.ts", "src/**/*.test.ts", "scripts/**/*.test.ts"]
  }
});
