// The root vite.config.ts loads this, so every path in it is relative to the repo root.
import type { OxfmtConfig } from "vite-plus/fmt";

export default {
  // Biome formats stylesheets (biome.jsonc).
  ignorePatterns: ["apps/site/public/**", "apps/site/src/**/*.css"],
  trailingComma: "none",
  arrowParens: "avoid",
  printWidth: 100,
  sortPackageJson: false,
  sortTailwindcss: { stylesheet: "./apps/site/src/styles/global.css", functions: ["cn", "cva"] },
  overrides: [
    { files: ["packages/content/**/*.md"], options: { semi: false, trailingComma: "all" } }
  ]
} satisfies OxfmtConfig;
