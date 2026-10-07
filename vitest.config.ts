import { readFileSync } from "node:fs";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// The Workers pool has no filesystem and Vite swallows `?raw` for CSS, so read
// the stylesheets on the host and inline them for src/styles/*.test.{ts,tsx}.
const islandsCss = readFileSync("./src/styles/islands.css", "utf8");
const globalCss = readFileSync("./src/styles/global.css", "utf8");

// The pool's D1 starts empty; worker/test/apply-migrations.ts applies these
// per test file.
const d1Migrations = await readD1Migrations("./migrations");

export default defineConfig({
  define: {
    __ISLANDS_CSS__: JSON.stringify(islandsCss),
    __GLOBAL_CSS__: JSON.stringify(globalCss)
  },
  test: {
    // 0 stops truncating `$field` values in it.each titles (and in failure messages).
    chaiConfig: { truncateThreshold: 0 },
    // V8 coverage doesn't work in the Workers pool. The globs name extensions so READMEs
    // and .astro files, which Istanbul can't parse, stay out.
    coverage: {
      provider: "istanbul",
      include: ["{src,worker,utils,contracts,scripts}/**/*.{ts,tsx}"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "**/fixtures.ts", "worker/test/**"],
      reporter: ["text-summary", "lcov"]
    },
    projects: [
      {
        extends: true,
        define: { __D1_MIGRATIONS__: JSON.stringify(d1Migrations) },
        plugins: [cloudflareTest({ wrangler: { configPath: "./worker/test/wrangler.jsonc" } })],
        test: {
          name: "workers",
          setupFiles: ["./worker/test/apply-migrations.ts"],
          include: ["worker/test/**/*.test.ts", "src/**/*.test.ts"]
        }
      },
      // The scripts run on Node or Bun, and use what workerd lacks: node:util's parseArgs,
      // node:readline, and the native bindings oxlint's RuleTester loads.
      {
        extends: true,
        test: { name: "node", environment: "node", include: ["scripts/**/*.test.ts"] }
      },
      // React islands and the stylesheet test need a real DOM, media elements and
      // layout, which workerd lacks.
      {
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.test.tsx"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }]
          }
        }
      }
    ]
  }
});
