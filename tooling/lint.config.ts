// The root vite.config.ts loads this, so every path in it is relative to the repo root.
import type { OxlintConfig, OxlintOverride } from "vite-plus/lint";

type Pattern = { regex: string; message: string; allowTypeImports?: boolean };

// Each layer is a folder in a workspace package (README.md › Imports). It imports itself and the
// layers in `uses`: inside its own package by the subpath import in `imports`, from another
// package by name. import/no-relative-parent-imports stops `../` from going around them.
const LAYER_NAMES = [
  "site",
  "api",
  "siteScripts",
  "tts",
  "tooling",
  "brand",
  "content",
  // After content: a file gets the last matching override, and this folder sits inside it.
  "contentVite",
  "contracts",
  "utils"
] as const;
type LayerName = (typeof LAYER_NAMES)[number];
// `imports` is left out for a layer nothing imports.
type Layer = { dir: string; pkg: string; imports?: string; uses: LayerName[]; also?: Pattern[] };

// Contracts and content reach both the browser bundle and the Worker, so they take no framework.
const FRAMEWORKS =
  "^(astro|@astrojs/|hono|agents|ai$|@ai-sdk/|@cloudflare/|cloudflare:|node:|react|@modelcontextprotocol/)";

const LAYERS: Record<LayerName, Layer> = {
  site: {
    dir: "apps/site/src/",
    pkg: "@murugappan/site",
    imports: "#src/",
    uses: ["content", "contracts", "utils"]
  },
  api: {
    dir: "apps/api/{src,test}/",
    pkg: "@murugappan/api",
    imports: "#src/",
    uses: ["content", "contracts", "utils"]
  },
  siteScripts: {
    dir: "apps/site/scripts/",
    pkg: "@murugappan/site",
    imports: "#scripts/",
    uses: ["site", "contracts", "utils"]
  },
  tts: { dir: "apps/tts/", pkg: "@murugappan/tts", uses: ["content", "contracts", "utils"] },
  tooling: { dir: "tooling/", pkg: "@murugappan/tooling", uses: [] },
  brand: { dir: "apps/brand/", pkg: "@murugappan/brand", uses: [] },
  content: {
    dir: "packages/content/",
    pkg: "@murugappan/content",
    imports: "@murugappan/content/",
    uses: ["contracts", "utils"],
    also: [
      {
        regex: `${FRAMEWORKS}|\\.(png|jpe?g|gif|webp|avif|svg)$`,
        allowTypeImports: true,
        message:
          "packages/content/ holds sources and pure functions the apps share, so it imports no framework, runtime package or image (type imports are fine). Resolve those in the app that needs them (README.md › Imports)."
      }
    ]
  },
  contracts: {
    dir: "packages/contracts/",
    pkg: "@murugappan/contracts",
    imports: "@murugappan/contracts/",
    uses: ["utils"],
    also: [
      {
        regex: FRAMEWORKS,
        allowTypeImports: true,
        message:
          "Contracts hold only shapes and import no framework or runtime package (type imports are fine). Keep framework and Worker code in apps/site/src/ or apps/api/src/ (README.md › Imports)."
      }
    ]
  },
  contentVite: {
    dir: "packages/content/vite/",
    pkg: "@murugappan/content",
    imports: "@murugappan/content/vite/",
    uses: ["content", "contracts", "utils"]
  },
  utils: {
    dir: "packages/utils/",
    pkg: "@murugappan/utils",
    imports: "@murugappan/utils/",
    uses: []
  }
};

// How `from` names `to`: by subpath import inside one package, by package name across two.
// A library's folders keep their own prefix (@murugappan/content/vite/), which already is one.
// A layer without `imports` has no name inside its own package.
function specifier({ from, to }: { from: LayerName; to: LayerName }): string[] {
  const { pkg, imports } = LAYERS[to];
  if (imports?.startsWith("@")) return [imports];
  if (LAYERS[from].pkg !== pkg) return [`${pkg}/`];
  return imports ? [imports] : [];
}

function layerPatterns(name: LayerName): Pattern[] {
  const allowed = new Set<LayerName>([name, ...LAYERS[name].uses]);
  const allowedSpecifiers = [...allowed].flatMap(to => specifier({ from: name, to }));
  const banned = [
    ...new Set(
      LAYER_NAMES.filter(other => !allowed.has(other)).flatMap(to => specifier({ from: name, to }))
    )
  ].filter(spec => !allowedSpecifiers.includes(spec));
  if (banned.length === 0) return [];
  return [
    {
      regex: `^(${banned.join("|")})`,
      message: `${LAYERS[name].dir} imports only ${allowedSpecifiers.join(", ")} (README.md › Imports). Move code both sides need to @murugappan/content, contracts or utils.`
    }
  ];
}

// A file gets the options of the last override that matches it, so each one carries every
// pattern that applies to its files.
const restrict = (files: string[], patterns: Pattern[]): OxlintOverride => ({
  files,
  rules: { "no-restricted-imports": ["error", { patterns }] }
});

const SITE = layerPatterns("site");

export default {
  ignorePatterns: ["apps/site/public/**"],
  plugins: ["typescript", "unicorn", "oxc", "react", "import", "promise"],
  options: { typeAware: true, reportUnusedDisableDirectives: "error" },
  jsPlugins: ["./tooling/oxlint/test-behaviour.ts", "./tooling/oxlint/contracts.ts"],
  categories: { correctness: "error" },
  // oxlint takes settings only at the top level; the override below scopes the plugin.
  settings: { tailwindcss: { entryPoint: "apps/site/src/styles/global.css" } },
  rules: {
    "no-irregular-whitespace": ["error", { skipComments: true }],
    "react/purity": "warn",
    "react/set-state-in-effect": "warn",
    "typescript/no-explicit-any": "error",
    "typescript/ban-ts-comment": [
      "error",
      { "ts-expect-error": "allow-with-description", "ts-ignore": true, "ts-nocheck": true }
    ],
    "no-else-return": ["error", { allowElseIf: false }],
    "no-lonely-if": "error",
    "no-shadow": "error",
    eqeqeq: ["error", "always", { null: "ignore" }],
    "unicorn/prefer-array-find": "error",
    "unicorn/prefer-string-replace-all": "error",
    "max-depth": ["error", { max: 3 }],
    "max-params": ["error", { max: 3 }],
    "typescript/no-non-null-assertion": "error",
    "typescript/consistent-type-assertions": ["error", { assertionStyle: "never" }],
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unsafe-argument": "error",
    "typescript/no-unsafe-call": "error",
    "typescript/no-unsafe-member-access": "error",
    "typescript/no-unsafe-return": "error",
    "typescript/no-unsafe-type-assertion": "error",
    "typescript/no-unnecessary-type-assertion": "error",
    "typescript/no-unnecessary-type-conversion": "error",
    "typescript/switch-exhaustiveness-check": "error",
    "typescript/no-deprecated": "error",
    "typescript/only-throw-error": "error",
    "typescript/no-misused-promises": "error",
    "typescript/return-await": "error",
    // `||` on strings is deliberate: a blank value counts as missing.
    "typescript/prefer-nullish-coalescing": ["error", { ignorePrimitives: { string: true } }],
    "import/no-relative-parent-imports": "error"
  },
  overrides: [
    ...LAYER_NAMES.map(name =>
      restrict([`${LAYERS[name].dir}**`], [...layerPatterns(name), ...(LAYERS[name].also ?? [])])
    ),
    // Shared code serves every page, so it can't reach into a page area's folder.
    restrict(
      [
        "apps/site/src/components/*",
        "apps/site/src/components/chat/**",
        "apps/site/src/components/ui/**",
        "apps/site/src/layouts/Layout.astro",
        "apps/site/src/lib/*",
        "apps/site/src/data/**",
        "apps/site/src/directives/**"
      ],
      [
        ...SITE,
        {
          regex:
            "^#src/(components|lib|styles)/(blog|home)/|^#src/layouts/BlogLayout|^\\./(blog|home)/|^\\./BlogLayout",
          message:
            "Shared code can't import from a blog/ or home/ folder. Move the module to the shared folder, or the importer into that area (apps/site/src/README.md › Folders)."
        }
      ]
    ),
    // The homepage may show the blog's posts; the blog never reaches into the homepage.
    restrict(
      [
        "apps/site/src/components/blog/**",
        "apps/site/src/lib/blog/**",
        "apps/site/src/styles/blog/**",
        "apps/site/src/layouts/BlogLayout.astro"
      ],
      [
        ...SITE,
        {
          regex: "^#src/components/home/",
          message:
            "Blog code can't import homepage components. Move a component both use to the root of apps/site/src/components (apps/site/src/README.md › Folders)."
        }
      ]
    ),
    // oxlint-tailwindcss's recommended set (its README › Setup) plus two rules, all at error.
    // prefer-scale-token turns px into scale steps. no-arbitrary-value keeps values on
    // Tailwind's scale and the theme's tokens; where Tailwind has no default for a value,
    // disable it on that line with the reason. Class order comes from oxfmt (sortTailwindcss).
    {
      files: ["apps/site/src/**/*.{ts,tsx}"],
      jsPlugins: ["oxlint-tailwindcss"],
      rules: {
        "tailwindcss/no-conflicting-classes": "error",
        "tailwindcss/no-contradicting-variants": "error",
        "tailwindcss/no-dark-without-light": "error",
        "tailwindcss/no-duplicate-classes": "error",
        "tailwindcss/no-dynamic-classes": "error",
        "tailwindcss/no-unknown-classes": "error",
        "tailwindcss/enforce-canonical": "error",
        "tailwindcss/enforce-negative-arbitrary-values": "error",
        "tailwindcss/no-deprecated-classes": "error",
        "tailwindcss/no-unnecessary-arbitrary-value": "error",
        "tailwindcss/prefer-scale-token": "error",
        "tailwindcss/consistent-variant-order": "error",
        "tailwindcss/enforce-consistent-important-position": "error",
        "tailwindcss/enforce-consistent-variable-syntax": "error",
        "tailwindcss/enforce-shorthand": "error",
        "tailwindcss/no-unnecessary-whitespace": "error",
        "tailwindcss/no-hardcoded-colors": "error",
        "tailwindcss/no-arbitrary-value": "error",
        // This rule is experimental. It flags a plain element that rebuilds a shadcn primitive from its classes.
        "tailwindcss/no-borrowed-component-styles": [
          "error",
          { components: ["apps/site/src/components/ui"] }
        ],
        "react/forbid-dom-props": [
          "error",
          {
            forbid: [
              {
                propName: "style",
                message:
                  "Style with Tailwind: utilities in className, or an @utility or @theme token in apps/site/src/styles/global.css."
              }
            ]
          }
        ]
      }
    },
    { files: ["packages/contracts/**"], rules: { "contracts/shapes-only": "error" } },
    {
      files: ["tooling/ts-alias.cjs"],
      rules: {
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-return": "off"
      }
    },
    {
      files: ["**/*.test.{ts,tsx}"],
      plugins: ["vitest"],
      rules: {
        "tests/observe-behaviour": "error",
        "vitest/consistent-test-it": ["error", { fn: "it" }],
        "vitest/no-conditional-expect": "error",
        "vitest/no-standalone-expect": "error",
        // Vitest's expect(value, message) takes a second argument.
        "vitest/valid-expect": ["error", { maxArgs: 2 }],
        "vitest/no-restricted-matchers": [
          "error",
          {
            toBeDefined: "Passes for any value. Assert the literal value (see AGENTS.md › Tests).",
            toBeTruthy:
              "Passes for any value. Assert the literal value, e.g. toBe(true) (see AGENTS.md › Tests).",
            toBeFalsy:
              "Passes for undefined. Assert the literal value, e.g. toBe(false) (see AGENTS.md › Tests).",
            toHaveBeenCalled:
              "Asserts only that a call happened. Assert the payload with toHaveBeenCalledWith or the state after the call (see AGENTS.md › Tests).",
            toHaveBeenCalledTimes:
              "Asserts only that calls happened. Assert the payloads via fn.mock.calls (see AGENTS.md › Tests)."
          }
        ]
      }
    }
  ]
} satisfies OxlintConfig;
