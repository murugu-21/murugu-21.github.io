// The root vite.config.ts loads this, so every path in it is relative to the repo root.
import type { OxfmtConfig } from "vite-plus/fmt";

const tailwindFunctions = ["cn", "cva"];

export default {
  // Biome formats stylesheets (biome.jsonc).
  ignorePatterns: ["apps/site/public/**", "apps/site/src/**/*.css"],
  trailingComma: "none",
  arrowParens: "avoid",
  printWidth: 100,
  sortPackageJson: false,
  astro: true,
  sortTailwindcss: {
    stylesheet: "./apps/site/src/styles/global.css",
    functions: tailwindFunctions
  },
  overrides: [
    { files: ["packages/content/**/*.md"], options: { semi: false, trailingComma: "all" } },
    {
      files: ["apps/site/src/pages/resume.astro", "apps/site/src/components/resume/**/*.astro"],
      options: {
        sortTailwindcss: {
          stylesheet: "./apps/site/src/styles/resume.css",
          functions: tailwindFunctions
        }
      }
    }
  ]
} satisfies OxfmtConfig;
