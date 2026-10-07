import { readFileSync } from "node:fs";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// The Workers pool has no filesystem and Vite swallows `?raw` for CSS, so read
// the stylesheets on the host and inline them for src/styles/*.test.ts.
const islandsCss = readFileSync("./src/styles/islands.css", "utf8");
const globalCss = readFileSync("./src/styles/global.css", "utf8");

// The pool's D1 starts empty; worker/test/apply-migrations.ts applies these
// per test file.
const d1Migrations = await readD1Migrations("./migrations");

export default defineConfig({
  test: {
    // 0 stops truncating `$field` values in it.each titles (and in failure messages).
    chaiConfig: { truncateThreshold: 0 },
    // V8 coverage doesn't work in the Workers pool. The globs name extensions so READMEs
    // and .astro files, which Istanbul can't parse, stay out.
    coverage: {
      provider: "istanbul",
      include: ["{src,worker,utils,contracts,scripts}/**/*.{ts,tsx}"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "worker/test/**"],
      reporter: ["text-summary", "lcov"]
    },
    projects: [
      {
        extends: true,
        define: {
          __ISLANDS_CSS__: JSON.stringify(islandsCss),
          __GLOBAL_CSS__: JSON.stringify(globalCss),
          __D1_MIGRATIONS__: JSON.stringify(d1Migrations)
        },
        plugins: [
          cloudflareTest({
            experimental: { newConfig: { configPath: "./worker/test/cloudflare.config.ts" } },
            // The pool renames the Worker under test but not Durable Object
            // self-references, so a `bindings.durableObject({ worker })` in the test
            // config fails to start. A bare class name binds to the Worker itself.
            miniflare: {
              durableObjects: {
                ChatRoom: { className: "ChatRoom", useSQLite: true },
                RateLimiter: { className: "RateLimiter", useSQLite: true }
              }
            }
          })
        ],
        test: {
          name: "workers",
          setupFiles: ["./worker/test/apply-migrations.ts"],
          include: ["worker/test/**/*.test.ts", "src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["scripts/lint/**"]
        }
      },
      // oxlint's RuleTester loads native bindings, which workerd can't.
      {
        extends: true,
        test: { name: "lint", environment: "node", include: ["scripts/lint/**/*.test.ts"] }
      }
    ]
  }
});
