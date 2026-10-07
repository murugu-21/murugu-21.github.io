import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "react", "import", "promise"],
  options: { typeAware: true, reportUnusedDisableDirectives: "error" },
  jsPlugins: ["./scripts/lint/test-behaviour.ts"],
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
    "typescript/prefer-nullish-coalescing": ["error", { ignorePrimitives: { string: true } }]
  },
  overrides: [
    {
      files: ["**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                regex: "^\\.\\./",
                message:
                  "Import across folders through the #src, #worker, #utils and #scripts subpath imports (package.json)."
              }
            ]
          }
        ]
      }
    },
    {
      // Shared code serves every page, so it can't reach into a page area's folder.
      // Later overrides replace this rule's options, so each restates the "../" ban.
      files: [
        "src/components/*",
        "src/components/chat/**",
        "src/components/ui/**",
        "src/layouts/Layout.astro",
        "src/lib/*",
        "src/data/**",
        "src/directives/**"
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                regex:
                  "^#src/(components|lib|styles)/(blog|home)/|^#src/layouts/BlogLayout|^\\./(blog|home)/|^\\./BlogLayout|^\\.\\./",
                message:
                  "Shared code can't import from a blog/ or home/ folder. Move the module to the shared folder, or the importer into that area (README › Source layout). Cross-folder imports use the #src subpath import."
              }
            ]
          }
        ]
      }
    },
    {
      // Exempt from the shared-code boundary: /llms.txt lists every post, so this
      // imports the blog's post helpers. Only the "../" ban stays.
      files: ["src/lib/llms.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                regex: "^\\.\\./",
                message:
                  "Import across folders through the #src, #worker, #utils and #scripts subpath imports (package.json)."
              }
            ]
          }
        ]
      }
    },
    {
      // The homepage may show the blog's posts; the blog never reaches into the homepage.
      files: [
        "src/components/blog/**",
        "src/lib/blog/**",
        "src/styles/blog/**",
        "src/layouts/BlogLayout.astro"
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                regex: "^#src/components/home/|^\\.\\./",
                message:
                  "Blog code can't import homepage components. Move a component both use to the root of src/components (README › Source layout). Cross-folder imports use the #src subpath import."
              }
            ]
          }
        ]
      }
    },
    {
      files: ["scripts/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                regex: "^(#worker/|\\.\\./)",
                message:
                  "Scripts don't import Worker code (move app-agnostic helpers to utils/), and cross-folder imports use the #src, #utils and #scripts subpath imports."
              }
            ]
          }
        ]
      }
    },
    {
      files: ["scripts/ts-alias.cjs"],
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
