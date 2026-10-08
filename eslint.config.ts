import css from "@eslint/css";
import astro from "eslint-plugin-astro";
import tailwind from "eslint-plugin-better-tailwindcss";
import { defineConfig } from "eslint/config";
import { tailwind4 } from "tailwind-csstree";

const useTailwind =
  "Style with Tailwind: utilities in the markup, or an @utility or @theme token in src/styles/global.css.";

// Stylesheets hold Tailwind configuration, not hand-written rules. A style rule may
// only sit inside @utility, @theme (keyframes), @custom-variant or, in global.css,
// `@layer base`. @font-face and @page are allowed because Tailwind can't write them.
const allowedAtRules =
  "Atrule[name=/^(import|plugin|source|theme|utility|custom-variant|font-face|page)$/]";
const baseLayer = "Atrule[name='layer']:has(Layer[name='base'])";

const tailwindOnlyCss = (topLevelAtRules: string) => [
  { selector: "StyleSheet > Rule", message: useTailwind },
  { selector: `StyleSheet > Atrule:not(${topLevelAtRules})`, message: useTailwind },
  {
    selector: "Atrule[name='apply']",
    message:
      "No @apply: when utilities repeat, extract a component (Tailwind › Managing duplication)."
  }
];

// Covers .astro templates until oxlint can parse them, and stylesheets, which oxlint
// can't parse at all (README.md › Checks).
export default defineConfig([
  astro.configs.recommended,
  astro.configs["jsx-a11y-recommended"],
  {
    files: ["**/*.astro"],
    extends: [tailwind.configs["recommended-error"]],
    // Without rootFontSize, px arbitrary values never canonicalize to the spacing scale.
    settings: {
      "better-tailwindcss": { entryPoint: "src/styles/global.css", rootFontSize: 16 }
    },
    rules: {
      // Prettier owns line breaks in .astro.
      "better-tailwindcss/enforce-consistent-line-wrapping": "off",
      // The typography plugin's documented opt-out marker, not a utility.
      "better-tailwindcss/no-unknown-classes": ["error", { ignore: ["^not-prose$"] }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXElement[openingElement.name.name='style']",
          message: `No <style> blocks. ${useTailwind}`
        },
        {
          selector: "JSXAttribute[name.name='style']",
          message: `No style attribute. ${useTailwind}`
        },
        {
          selector: "JSXAttribute > JSXNamespacedName[namespace.name='class'][name.name='list']",
          message: "Use class={cn(…)}, which merges Tailwind classes, or a cva() variant."
        },
        {
          // .tsx has no equivalent check because oxlint has no no-restricted-syntax.
          selector: "CallExpression[callee.name='cn'] > ConditionalExpression",
          message: "Choosing between class sets is a variant, so use cva()."
        }
      ]
    }
  },
  {
    // The resume has its own Tailwind entry (no preflight, no site theme).
    files: ["src/pages/resume.astro", "src/components/resume/*.astro"],
    settings: {
      "better-tailwindcss": { entryPoint: "src/styles/resume.css", rootFontSize: 16 }
    }
  },
  {
    files: ["**/*.css"],
    plugins: { css },
    language: "css/css",
    // Tolerant mode is on because tailwind-csstree can't parse some valid Tailwind 4, such as
    // @keyframes or var() inside @theme and @supports nested in @utility. Those regions
    // become Raw nodes the selectors below can't inspect.
    languageOptions: { customSyntax: tailwind4, tolerant: true },
    extends: [css.configs.recommended],
    rules: {
      // Tailwind defines its theme variables in files the linter doesn't read.
      "css/no-invalid-properties": ["error", { allowUnknownVariables: true }],
      // It reads an @utility body as descriptors and rejects ordinary properties; the
      // top-level at-rule list below already limits which at-rules may appear.
      "css/no-invalid-at-rules": "off",
      // Its year and "newly" levels don't line up with the floor in
      // src/lib/browser-support.ts: 2023 rejects light-dark(), 2024 admits Safari 18.
      "css/use-baseline": "off",
      "no-restricted-syntax": [
        "error",
        ...tailwindOnlyCss(allowedAtRules),
        {
          selector: "Atrule[name='utility']",
          message: "Every @utility lives in src/styles/global.css, the one stylesheet to review."
        }
      ]
    }
  },
  {
    files: ["src/styles/global.css"],
    rules: {
      "no-restricted-syntax": ["error", ...tailwindOnlyCss(`${allowedAtRules}, ${baseLayer}`)]
    }
  }
]);
