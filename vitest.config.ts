import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

import { SITE_DIR } from "#scripts/site/site-dir.ts";

// The pool's D1 starts empty; worker/test/apply-migrations.ts applies these
// per test file.
const d1Migrations = await readD1Migrations("./migrations");

// Tests tagged "live" bill the DeepSeek API, so only `bun run test:live` runs them, and only
// that run hands the pool the key and the built llms.txt Jarvis grounds on.
const live = process.argv.some(
  (arg, i, argv) =>
    arg === "--tags-filter=live" || (arg === "--tags-filter" && argv[i + 1] === "live")
);

function readLiveBindings(): Record<string, string> {
  const key = existsSync(".dev.vars")
    ? parseEnv(readFileSync(".dev.vars", "utf8")).DEEPSEEK_API_KEY
    : undefined;
  if (!key) throw new Error("bun run test:live needs DEEPSEEK_API_KEY in .dev.vars");
  const llmsTxt = join(SITE_DIR, "llms.txt");
  if (!existsSync(llmsTxt)) throw new Error(`${llmsTxt} is missing; run bun run build first`);
  return { LIVE_DEEPSEEK_API_KEY: key, LIVE_LLMS_TXT: readFileSync(llmsTxt, "utf8") };
}
const liveBindings = live ? readLiveBindings() : {};

export default defineConfig({
  test: {
    // 0 stops truncating values in failure messages.
    chaiConfig: { truncateThreshold: 0 },
    // Keeps `$field` values in it.each titles whole. 0 doesn't switch the limit off: it still
    // clips the last character of a string.
    taskTitleValueFormatTruncate: Number.MAX_SAFE_INTEGER,
    // Vitest empties every CSS import it doesn't include, `?raw` too, so the stylesheet
    // tests in src/styles would read "".
    css: { include: [/global\.css\?raw$/] },
    // The globs name extensions so READMEs and .astro files, which Istanbul can't parse,
    // stay out.
    coverage: {
      provider: "istanbul",
      include: ["{src,worker,utils,content,contracts,scripts}/**/*.{ts,tsx}"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "**/fixtures.ts", "worker/test/**"],
      reporter: ["text-summary", "lcov"]
    },
    projects: [
      {
        define: { __D1_MIGRATIONS__: JSON.stringify(d1Migrations) },
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./worker/test/wrangler.jsonc" },
            miniflare: { bindings: liveBindings }
          })
        ],
        test: {
          name: "workers",
          tags: [
            {
              name: "live",
              description: "Calls the paid DeepSeek API. Run with bun run test:live.",
              skip: !live,
              timeout: 180_000
            }
          ],
          setupFiles: ["./worker/test/apply-migrations.ts"],
          include: ["worker/test/**/*.test.ts"]
        }
      },
      // src runs in the browser or at build time, never in a Worker, and starting each file in
      // workerd costs far more than the tests. The scripts run on Node or Bun.
      {
        test: {
          name: "node",
          environment: "node",
          include: ["scripts/**/*.test.ts", "src/**/*.test.ts", "content/**/*.test.ts"]
        }
      },
      // React islands and the stylesheet test need a real DOM, media elements and
      // layout, which workerd lacks.
      {
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
