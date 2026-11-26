import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "vite-plus/test/browser-playwright";
import { configDefaults, defineConfig } from "vite-plus";

import { readCloudflareConfigs } from "@murugappan/api/read-cloudflare-configs.ts";
import { contentPosts } from "@murugappan/content/vite/posts-plugin.ts";
import fmt from "@murugappan/tooling/fmt.config.ts";
import lint from "@murugappan/tooling/lint.config.ts";
import { ifPresent } from "@murugappan/utils/node/fs.ts";

const d1Migrations = await readD1Migrations("./apps/api/migrations");

const TEST_CLOUDFLARE_CONFIG = "./apps/api/test/cloudflare.config.ts";
const cloudflareConfigs = await readCloudflareConfigs({
  production: "./apps/api/cloudflare.config.ts",
  test: TEST_CLOUDFLARE_CONFIG
});

// Tests tagged "live" bill the DeepSeek API, so only `bun run test:live` runs them, and only
// that run hands the pool the key.
const { values: testArgs } = parseArgs({
  options: { "tags-filter": { type: "string" } },
  strict: false
});
const live = testArgs["tags-filter"] === "live";

const DEV_VARS = "apps/api/.dev.vars";
async function readLiveBindings() {
  const vars = await ifPresent(readFile(DEV_VARS, "utf8"));
  const key = vars && parseEnv(vars).DEEPSEEK_API_KEY;
  if (!key) throw new Error(`bun run test:live needs DEEPSEEK_API_KEY in ${DEV_VARS}`);
  return { LIVE_DEEPSEEK_API_KEY: key };
}
const liveBindings = live ? await readLiveBindings() : {};

export default defineConfig({
  lint,
  fmt,
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
    exclude: [...configDefaults.exclude, "**/lint-fixture-*/**"],
    chaiConfig: { truncateThreshold: 0 },
    // Keeps `$field` values in it.each titles whole. 0 doesn't switch the limit off: it still
    // clips the last character of a string.
    taskTitleValueFormatTruncate: Number.MAX_SAFE_INTEGER,
    sequence: { shuffle: true },
    maxWorkers: "67%",
    // Vitest empties every CSS import it doesn't include, `?raw` and `?inline` too, so the
    // stylesheet tests would read "" and the cookie banner and components would have no styles.
    css: { include: [/global\.css(\?raw)?$/, /cookieconsent\.css\?inline$/] },
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
        "apps/site/src/test/**",
        "apps/site/src/lib/inline/**"
      ],
      reporter: ["text-summary", "lcov"]
    },
    projects: [
      {
        define: {
          __D1_MIGRATIONS__: JSON.stringify(d1Migrations),
          __CLOUDFLARE_CONFIGS__: JSON.stringify(cloudflareConfigs)
        },
        plugins: [
          contentPosts(),
          cloudflareTest({
            config: TEST_CLOUDFLARE_CONFIG,
            miniflare: { bindings: liveBindings }
          })
        ],
        test: {
          name: "workers",
          // With the cache on, the pool sends each later test file every cached module in one
          // WebSocket message, which workerd rejects as too large (1009).
          fsModuleCache: false,
          isolate: false,
          tags: [
            {
              name: "live",
              description: "Calls the paid DeepSeek API. Run with bun run test:live.",
              skip: !live,
              timeout: 180_000
            }
          ],
          setupFiles: ["./apps/api/test/start-fresh.ts"],
          include: ["apps/api/{src,test}/**/*.test.ts"]
        }
      },
      {
        plugins: [contentPosts()],
        resolve: {
          alias: {
            "astro:content": fileURLToPath(
              new URL("apps/site/src/test/astro-content.ts", import.meta.url)
            ),
            "astro:env/server": fileURLToPath(
              new URL("apps/site/src/test/astro-env-server.ts", import.meta.url)
            ),
            "virtual:github-snapshot": fileURLToPath(
              new URL("apps/site/src/test/github-snapshot.ts", import.meta.url)
            )
          }
        },
        test: {
          name: "node",
          environment: "node",
          isolate: false,
          setupFiles: ["./apps/site/src/test/start-fresh.ts"],
          include: [
            "tooling/**/*.test.ts",
            "apps/site/*.test.ts",
            "apps/site/{src,scripts}/**/*.test.ts",
            "apps/tts/*.test.ts",
            "packages/**/*.test.ts"
          ]
        }
      },
      {
        // Discovered mid-run, it would make Vite reload the test with a second copy of React.
        optimizeDeps: { include: ["react-dom/server"] },
        plugins: [tailwindcss()],
        test: {
          name: "browser",
          include: ["apps/site/src/**/*.test.tsx"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              contextOptions: { permissions: ["clipboard-read", "clipboard-write"] }
            }),
            instances: [{ browser: "chromium" }]
          }
        }
      },
      {
        test: {
          name: "e2e",
          environment: "node",
          include: ["apps/api/e2e/**/*.test.ts"],
          globalSetup: ["apps/api/e2e/setup.ts"]
        }
      }
    ]
  }
});
