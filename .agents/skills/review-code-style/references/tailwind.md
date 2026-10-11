# Tailwind CSS v4

**Lint covers.** In `.ts` and `.tsx`, `oxlint-tailwindcss` checks conflicting, duplicate, unknown, deprecated and dynamically built classes, arbitrary values, hard-coded colours, `dark:` without a light pair, and re-styled shadcn primitives. `react/forbid-dom-props` bans `style`. In `.astro`, Biome bans inline styles, arbitrary values and raw palette colours. In CSS, `tooling/biome/tailwind-only-css.grit` allows only Tailwind configuration (`@theme`, `@utility` in `global.css`, `@custom-variant`, `@layer base`) and no `@apply`. `useBaseline` holds CSS to the 2024 browser floor. In `.astro`, `tooling/biome/cn-variants.grit` turns a ternary inside `cn()` into a `cva()` variant. Biome doesn't lint `.tsx`, so check `cn()` there by hand (TW-3). Oxfmt and Prettier sort classes.

Rules lint can't check:

- **TW-1.** In `.astro` class lists, check what lint checks only in `.tsx`: no conflicting utilities on one element, no class names built by interpolation, and a `dark:` pair for every light colour.
- **TW-2.** A new design value becomes a token in `@theme` in `apps/site/src/styles/global.css`. A token that reads another variable goes in `@theme inline`, or it resolves at `:root` instead of where it's used. A one-off arbitrary value keeps its disable comment with the reason Tailwind has no default.
- **TW-3.** A component with visual variants uses `cva` for the variant table and `cn` to merge an incoming `className`. Don't branch on class strings in markup.
- **TW-4.** Every animation or transition has a reduced-motion form: `motion-reduce:animate-none`, or `motion-safe:` on the animation. JS animations check `prefers-reduced-motion` before they start.
- **TW-5.** Interactive elements keep a visible focus style (`focus-visible:` ring or outline). Removing an outline without a replacement is a finding.
- **TW-6.** A CSS feature newer than the README's floor (Chrome 123, Firefox 128, Safari 17.5) degrades gracefully, and its `useBaseline` allow-list entry says why. Utilities in markup escape `useBaseline`, so check new variants such as `@starting-style` or `:has()` by hand.
- **TW-7.** Use the font through `--font-fira-code`, never `"Fira Code"`. The build renames the font (README.md › Tests and checks).

Sources: https://tailwindcss.com/docs/theme, https://tailwindcss.com/docs/adding-custom-styles, https://tailwindcss.com/docs/functions-and-directives, https://tailwindcss.com/docs/detecting-classes-in-source-files, https://tailwindcss.com/docs/dark-mode, https://ui.shadcn.com/docs/tailwind-v4, https://web.dev/articles/prefers-reduced-motion.
