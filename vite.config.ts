import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { playwright } from "vite-plus/test/browser-playwright";
import { defineConfig } from "vite-plus";

import { contentPosts } from "@murugappan/content/vite/posts-plugin.ts";
import fmt from "@murugappan/tooling/fmt.config.ts";
import lint from "@murugappan/tooling/lint.config.ts";

// The pool's D1 starts empty; apps/api/test/apply-migrations.ts applies these
// per test file.
const d1Migrations = await readD1Migrations("./apps/api/migrations");

// Tests tagged "live" bill the DeepSeek API, so only `bun run test:live` runs them, and only
// that run hands the pool the key.
const live = process.argv.some(
  (arg, i, argv) =>
    arg === "--tags-filter=live" || (arg === "--tags-filter" && argv[i + 1] === "live")
);

const DEV_VARS = "apps/api/.dev.vars";
function readLiveBindings() {
  const key = existsSync(DEV_VARS)
    ? parseEnv(readFileSync(DEV_VARS, "utf8")).DEEPSEEK_API_KEY
    : undefined;
  if (!key) throw new Error(`bun run test:live needs DEEPSEEK_API_KEY in ${DEV_VARS}`);
  return { LIVE_DEEPSEEK_API_KEY: key };
}
const liveBindings = live ? readLiveBindings() : {};

export default defineConfig({
  lint,
  fmt,
  // The flag keeps a commit that only touches ignored files (apps/site/public) from failing.
  staged: {
    "*.{js,mjs,jsx,ts,tsx}": [
      "vp lint --fix --no-error-on-unmatched-pattern",
      "vp fmt --no-error-on-unmatched-pattern"
    ],
    "*.{json,jsonc,md}": "vp fmt --no-error-on-unmatched-pattern",
    "*.css": "biome check --write --no-errors-on-unmatched",
    "*.astro": [
      "biome lint --write --no-errors-on-unmatched",
      "vp fmt --no-error-on-unmatched-pattern"
    ],
    "*.py": ["bun run --silent py ruff check --fix", "bun run --silent py ruff format"]
  },
  test: {
    // 0 stops truncating values in failure messages.
    chaiConfig: { truncateThreshold: 0 },
    // Keeps `$field` values in it.each titles whole. 0 doesn't switch the limit off: it still
    // clips the last character of a string.
    taskTitleValueFormatTruncate: Number.MAX_SAFE_INTEGER,
    // Random file and test order surfaces tests that lean on state an earlier test left.
    // Each run prints its seed. Pass --sequence.seed=<seed> to replay that order.
    sequence: { shuffle: true },
    // Vitest empties every CSS import it doesn't include, `?raw` too, so the stylesheet
    // tests in apps/site/src/styles would read "".
    css: { include: [/global\.css\?raw$/] },
    // The globs name extensions so READMEs and .astro files, which Istanbul can't parse,
    // stay out.
    coverage: {
      provider: "istanbul",
      include: [
        "{apps/site/src,apps/site/scripts,apps/api/src,packages,tooling}/**/*.{ts,tsx}",
        "apps/tts/*.ts"
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test-d.ts",
        "**/*.d.ts",
        "**/fixtures.ts",
        "apps/api/test/**",
        "apps/site/src/test/**"
      ],
      reporter: ["text-summary", "lcov"]
    },
    projects: [
      {
        define: { __D1_MIGRATIONS__: JSON.stringify(d1Migrations) },
        plugins: [
          contentPosts(),
          cloudflareTest({
            wrangler: { configPath: "./apps/api/test/wrangler.jsonc" },
            miniflare: { bindings: liveBindings }
          })
        ],
        test: {
          name: "workers",
          // workerd can't read Vitest's module cache until cloudflare/workers-sdk#16163 lands.
          fsModuleCache: false,
          tags: [
            {
              name: "live",
              description: "Calls the paid DeepSeek API. Run with bun run test:live.",
              skip: !live,
              timeout: 180_000
            }
          ],
          setupFiles: ["./apps/api/test/apply-migrations.ts"],
          // TODO: rename API tests to NestJS's convention (*.spec.ts beside the source,
          // *.e2e-spec.ts in test/) and update this glob, the coverage excludes and the test
          // globs in tooling/lint.config.ts.
          include: ["apps/api/{src,test}/**/*.test.ts"]
        }
      },
      // The site runs in the browser or at build time and the content and utils packages are pure,
      // so none of them needs workerd, and starting each file there costs far more than the tests.
      // The scripts run on Node or Bun.
      {
        plugins: [contentPosts()],
        // Astro's virtual modules exist only inside its Vite plugin.
        resolve: {
          alias: {
            "astro:content": fileURLToPath(
              new URL("apps/site/src/test/astro-content.ts", import.meta.url)
            ),
            "astro:env/server": fileURLToPath(
              new URL("apps/site/src/test/astro-env-server.ts", import.meta.url)
            )
          }
        },
        test: {
          name: "node",
          environment: "node",
          include: [
            "tooling/**/*.test.ts",
            "apps/site/{src,scripts}/**/*.test.ts",
            "apps/tts/*.test.ts",
            "packages/content/**/*.test.ts",
            "packages/utils/**/*.test.ts"
          ]
        }
      },
      // React islands and the stylesheet test need a real DOM, media elements and
      // layout, which workerd lacks.
      {
        test: {
          name: "browser",
          include: ["apps/site/src/**/*.test.tsx"],
          browser: {
            enabled: true,
            headless: true,
            // copy-code.test.tsx reads back what the copy button wrote.
            provider: playwright({
              contextOptions: { permissions: ["clipboard-read", "clipboard-write"] }
            }),
            instances: [{ browser: "chromium" }]
          }
        }
      }
    ]
  }
});
