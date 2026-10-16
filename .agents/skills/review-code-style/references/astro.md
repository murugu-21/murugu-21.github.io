# Astro

**Lint covers.** Biome's full a11y set and its Astro rules on templates (`biome.jsonc` › `**/*.astro`), `set:html` (each use needs a `biome-ignore` with its reason), `client:only` naming its framework, inline styles, `javascript:` URLs, and `astro/typed-props` (a component that reads `Astro.props` declares `Props`). Oxlint reads frontmatter and `<script>` bodies but not the template, and its type-aware rules don't run in `.astro` at all. Oxfmt sorts classes. `tooling/astro-whitespace.test.ts` catches joined words.

Rules lint can't check:

- **ASTRO-1.** Hydrate as little as possible. Plain Astro plus a processed `<script>` comes first. An island uses `client:interaction` (`apps/site/src/directives/interaction.ts`) unless the diff says why it needs `client:visible`, `client:idle` or `client:load`.
- **ASTRO-2.** Render images through `astro:assets` `<Image>` or `<Picture>`. A remote host goes in `image.domains` in `astro.config.ts`. A plain `<img>` needs a stated reason.
- **ASTRO-3.** Alt text says what the image conveys in context. Decorative images get `alt=""`. Never write "image", "picture" or "photo" in it. Biome can't see the alt on `<Image>`, so check it by hand.
- **ASTRO-4.** A plain `<img>` has `width` and `height`, and a `target="_blank"` link has `rel="noopener"`. Nothing checks either in `.astro`. Only the LCP image gets `loading="eager"` and `fetchpriority="high"`. Every other image stays lazy.
- **ASTRO-5.** A `set:html` value is build-time content the diff shows is trusted, or escaped. `apps/site/src/lib/schema.ts` shows the `</script>` escape for JSON-LD. A frontmatter field used as plain text elsewhere (meta tags) must not also go through `set:html`.
- **ASTRO-6.** `is:inline` and `define:vars` scripts stay limited to the pre-paint bootstraps in `layouts/Layout.astro` and `pages/outdated.astro`. Everything else is a processed `<script>` that imports from `#src/lib`.
- **ASTRO-7.** A component's script handles every instance on the page: `querySelectorAll`, a custom element, or `data-*` attributes for server values. A page-wide `getElementById` is fine only for a component rendered once.
- **ASTRO-8.** Pages with `getStaticPaths` type it with `satisfies GetStaticPaths` and read props with `InferGetStaticPropsType`.
- **ASTRO-9.** Collections live in `src/content.config.ts` with a loader and a zod schema. Sort and filter query results yourself, because `getCollection` order isn't stable.
- **ASTRO-10.** Read configuration through `astro:env` fields declared in `astro.config.ts`. Only `import.meta.env.DEV` and `PROD` are read directly.
- **ASTRO-11.** Don't add `<ClientRouter />`, prefetch or server islands without a measured need. Native `@view-transition` comes first, and server islands need an adapter this static site doesn't have.
- **ASTRO-12.** Every control's accessible name starts with its visible text (WCAG 2.5.3). A placeholder isn't a label.
- **ASTRO-13.** Shared code doesn't reach into a page area's folder (`apps/site/src/README.md` › Folders). Lint blocks the import, so check that a moved file landed where its consumers say it belongs.

Sources: https://docs.astro.build/en/guides/images/, https://docs.astro.build/en/reference/directives-reference/, https://docs.astro.build/en/guides/client-side-scripts/, https://docs.astro.build/en/guides/typescript/, https://docs.astro.build/en/guides/content-collections/, https://docs.astro.build/en/guides/view-transitions/, https://docs.astro.build/en/guides/server-islands/.
