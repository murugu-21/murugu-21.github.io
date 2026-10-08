import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";

// The pool's D1 starts empty; worker/test/apply-migrations.ts applies these
// per test file.
const d1Migrations = await readD1Migrations("./migrations");

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
      include: ["{src,worker,utils,contracts,scripts}/**/*.{ts,tsx}"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "**/fixtures.ts", "worker/test/**"],
      reporter: ["text-summary", "lcov"]
    },
    projects: [
      {
        define: { __D1_MIGRATIONS__: JSON.stringify(d1Migrations) },
        plugins: [cloudflareTest({ wrangler: { configPath: "./worker/test/wrangler.jsonc" } })],
        test: {
          name: "workers",
          setupFiles: ["./worker/test/apply-migrations.ts"],
          include: ["worker/test/**/*.test.ts", "src/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "src/**/*.node.test.ts"]
        }
      },
      // The scripts run on Node or Bun, and use what workerd lacks: node:util's parseArgs,
      // node:readline, and the native bindings oxlint's RuleTester loads. A src test that needs
      // Node too (ESLint's parser) is named *.node.test.ts.
      {
        test: {
          name: "node",
          environment: "node",
          include: ["scripts/**/*.test.ts", "src/**/*.node.test.ts"]
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
