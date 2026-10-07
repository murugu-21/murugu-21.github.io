import { defineConfig, type OxlintOverride } from "oxlint";

type Pattern = { regex: string; message: string; allowTypeImports?: boolean };

// The top-level folders are the packages a monorepo would split this repo into (README.md ›
// Layers). A layer imports itself and the layers in `uses`, through their `#<dir>` subpath imports;
// import/no-relative-parent-imports stops `../` from going around them.
const LAYER_NAMES = [
  "site",
  "worker",
  "siteScripts",
  "workerScripts",
  "lintScripts",
  "contracts",
  "utils"
] as const;
type LayerName = (typeof LAYER_NAMES)[number];
type Layer = { dir: string; uses: LayerName[]; also?: Pattern[] };

const LAYERS: Record<LayerName, Layer> = {
  site: { dir: "src/", uses: ["contracts", "utils"] },
  worker: { dir: "worker/", uses: ["contracts", "utils"] },
  siteScripts: { dir: "scripts/site/", uses: ["site", "contracts", "utils"] },
  workerScripts: { dir: "scripts/worker/", uses: ["worker", "contracts", "utils"] },
  lintScripts: { dir: "scripts/lint/", uses: [] },
  contracts: {
    dir: "contracts/",
    uses: ["utils"],
    // Contracts reach both the browser bundle and the Worker, so they take no framework.
    also: [
      {
        regex:
          "^(astro|@astrojs/|hono|agents|ai$|@ai-sdk/|@cloudflare/|cloudflare:|node:|react|@modelcontextprotocol/)",
        allowTypeImports: true,
        message:
          "Contracts hold only shapes and import no framework or runtime package (type imports are fine). Keep framework and Worker code in src/ or worker/ (README.md › Layers)."
      }
    ]
  },
  utils: { dir: "utils/", uses: [] }
};

const alias = (name: LayerName) => `#${LAYERS[name].dir}`;

function layerPatterns(name: LayerName): Pattern[] {
  const allowed = new Set<LayerName>([name, ...LAYERS[name].uses]);
  const banned = LAYER_NAMES.filter(other => !allowed.has(other)).map(alias);
  if (banned.length === 0) return [];
  return [
    {
      regex: `^(${banned.join("|")})`,
      message: `${LAYERS[name].dir} imports only ${[...allowed].map(alias).join(", ")} (README.md › Layers). Move code both sides need to contracts/ or utils/.`
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

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "react", "import", "promise"],
  options: { typeAware: true, reportUnusedDisableDirectives: "error" },
  jsPlugins: ["./scripts/lint/test-behaviour.ts", "./scripts/lint/contracts.ts"],
  categories: { correctness: "error" },
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
        "src/components/*",
        "src/components/chat/**",
        "src/components/ui/**",
        "src/layouts/Layout.astro",
        "src/lib/*",
        "src/data/**",
        "src/directives/**"
      ],
      [
        ...SITE,
        {
          regex:
            "^#src/(components|lib|styles)/(blog|home)/|^#src/layouts/BlogLayout|^\\./(blog|home)/|^\\./BlogLayout",
          message:
            "Shared code can't import from a blog/ or home/ folder. Move the module to the shared folder, or the importer into that area (src/README.md › Source layout)."
        }
      ]
    ),
    // Exempt from the shared-code boundary: /llms.txt lists every post, so this imports the
    // blog's post helpers.
    restrict(["src/lib/llms.ts"], SITE),
    // The homepage may show the blog's posts; the blog never reaches into the homepage.
    restrict(
      [
        "src/components/blog/**",
        "src/lib/blog/**",
        "src/styles/blog/**",
        "src/layouts/BlogLayout.astro"
      ],
      [
        ...SITE,
        {
          regex: "^#src/components/home/",
          message:
            "Blog code can't import homepage components. Move a component both use to the root of src/components (src/README.md › Source layout)."
        }
      ]
    ),
    { files: ["contracts/**"], rules: { "contracts/shapes-only": "error" } },
    {
      files: ["scripts/site/ts-alias.cjs"],
      rules: {
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-return": "off"
      }
    },
    {
      files: ["**/*.test.ts"],
      plugins: ["vitest"],
      rules: {
        "tests/observe-behaviour": "error",
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
});
