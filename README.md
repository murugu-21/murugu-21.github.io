# murugappan.dev

[![Code Coverage](https://qlty.sh/gh/murugu-21/projects/murugu-21.github.io/coverage.svg)](https://qlty.sh/gh/murugu-21/projects/murugu-21.github.io)

Personal portfolio and blog of Murugappan, built with [Astro 7](https://astro.build) and deployed as one Cloudflare Worker.

**Live site:** https://murugappan.dev

One Astro project serves both halves. Blog routes live in `src/pages/blog/`, so the `/blog` prefix comes from file position, not an Astro `base`. Every page except the print-only résumé renders through `src/layouts/Layout.astro`, whose `section` prop picks the portfolio or blog head defaults and page classes. The rest of `src/` is grouped by type, with blog-only code in a `blog/` folder inside each type folder (see [Source layout](src/README.md#source-layout)), and posts are markdown in `content/blog/<slug>/index.md`. Both halves share the light/dark theme through the `isDark` localStorage key.

## Feature docs

Each feature has a README next to its code:

- [`src/README.md`](src/README.md) covers the source layout, analytics and the resume.
- [`content/blog/README.md`](content/blog/README.md) covers writing posts, mermaid diagrams and the tag vocabulary.
- [`scripts/site/tts/README.md`](scripts/site/tts/README.md) covers the blog's read-aloud audio.
- [`worker/README.md`](worker/README.md) covers the routes the Worker owns, the discovery documents, the 404 and the AI chat widget.
- [`worker/api/README.md`](worker/api/README.md) covers the public API.
- [`worker/mcp/README.md`](worker/mcp/README.md) covers the MCP server.
- [`contracts/README.md`](contracts/README.md) covers what the site, the Worker and the scripts agree on.
- [`brand/README.md`](brand/README.md) covers the X profile banners.

## Development

```bash
bun install
bunx astro sync && bun run types   # once after cloning; lint and the typechecks need the generated types
bun run dev       # Astro dev server with HMR, pages only, on :4399
bun run build     # the static site to dist/, plus markdown renditions and the resume PDF
bun run preview   # the Worker in workerd over dist/ (wrangler dev), API and chat included, on :8787
```

`preview` passes `--local-upstream localhost:8787` so the Worker sees the local host, not the `murugappan.dev` route, and the generated discovery documents link back to it. `types` passes `--strict-vars=false` so `OPPORTUNITY_INBOX` is typed `string` and tests can override it.

`bun run dev` serves pages but not the Worker's routes. For the chat widget in dev, run `bun run build` once, start `bun run preview` alongside `bun run dev`, and put `PUBLIC_CHAT_HOST=localhost:8787` in a root `.env`. The Worker reads its data (`/api`, `llms.txt`) from `dist/`, so rebuild to refresh it.

### Layers

The top-level folders are the packages a monorepo would split this into. Each imports only itself and the layers `LAYERS` in `oxlint.config.ts` lets it use.

```text
src/              # the Astro site                     → apps/site
worker/           # the Worker: API, MCP, chat, audio  → apps/api
scripts/site/     # site build steps and blog tooling (resume, mermaid, font subset, read-aloud audio)
scripts/worker/   # Worker tooling (the live prompt capture)
scripts/lint/     # repo lint plugins
contracts/        # what the site, the Worker and scripts agree on → packages/contracts
utils/            # helpers with no app logic (zod JSON parsing, AI SDK message text)  → packages/utils
```

Lint enforces the graph. `LAYERS` lists each layer's folder and the layers it may use, and generates a `no-restricted-imports` rule per layer from it. `import/no-relative-parent-imports` stops a `../` import from going around the subpath imports, contracts may not import a framework or Worker package, and `contracts/shapes-only` (`scripts/lint/contracts.ts`) rejects a function exported from `contracts/`. Logic goes in the layer that runs it, or in `utils/` when the site and the Worker both need it. The one exception is `scripts/worker/live-test-capture.ts`, which reads the built site's `llms.txt` through `scripts/site/site-dir.ts`, the same file Jarvis grounds on in production. To add a layer or let one use another, edit `LAYERS`. The root config files (`astro.config.ts`, `wrangler.jsonc`, `vitest.config.ts`) belong to no layer, since they wire the layers together.

### Build

Astro builds a static site to `dist/`. Wrangler bundles the Worker (`worker/server.ts`, the `main` in `wrangler.jsonc`) on deploy and uploads `dist/` as its static assets, so deploy only after a build.

`astro build` produces everything:

- Markdown renditions (`index.md` next to each `index.html`, served for `Accept: text/markdown`) are prerendered endpoints under `src/pages/**/index.md.ts`. They share `src/lib/llms.ts` with `/llms.txt`.
- Mermaid diagrams and the resume PDF come from the `build-artifacts` integration in `astro.config.ts`.
- The site font is Fira Code 6.2 from the author's `firacode` package. Its release ships only full fonts, so `scripts/site/fira-code-subset.ts` cuts a latin-plus-arrows subset into `node_modules/.cache/fira-code/` at config setup (dev and build). The Astro Fonts API serves it with a fallback sized to Fira Code's metrics (local Courier New), and `global.css` adds the same sizing for Droid Sans Mono, Cousine and Liberation Mono (Android, ChromeOS, Linux with Liberation Mono), so the swap doesn't rewrap text. `<Font>` in each `<head>` defines `--font-fira-code`; the family name is hashed, so reference the variable, never `"Fira Code"`.
- Scripts that read the build find it through `scripts/site/site-dir.ts`.
- Imports across top-level folders go through the `#src/*`, `#worker/*`, `#contracts/*`, `#utils/*` and `#scripts/*` subpath imports in `package.json`, with the file extension, because TypeScript resolves them only as exact paths. Node, Bun, Vite and TypeScript read them natively. Lint rejects `../` imports. Imports within a folder or its subfolders stay relative.

Cloudflare serves pages straight from static assets. The Worker runs only for its own routes (`run_worker_first` in `wrangler.jsonc`) and for requests that match no asset (`not_found_handling: "none"`), which get the negotiated 404 described under [Discovery](worker/README.md#discovery-documents-and-the-404).

### Bun and Node

[Bun](https://bun.sh) installs dependencies, runs the package scripts and runs the TypeScript in `scripts/` directly. Its version is pinned in `packageManager` in `package.json`. Node (version in `.nvmrc`) runs Astro, Wrangler, Vitest and `tsc`. Under Bun, `wrangler dev` reports ready but never answers a request.

`test` is `vitest run`. Tests run inside workerd through `@cloudflare/vitest-plugin`, with two exceptions. The React island tests (`src/**/*.test.tsx`) run in headless Chromium through Vitest browser mode and `vitest-browser-react`. The `scripts/` tests run on Node (the scripts themselves run on Bun), because workerd lacks `node:util`'s `parseArgs`, `node:readline` and the native bindings oxlint's RuleTester loads. Run `bunx playwright install --only-shell chromium` once before the first run. Use `bun run test`, not `bun test`, which is Bun's own runner.

Bun blocks the install scripts of two packages here, and both are safe to leave blocked. `@posthog/cli` downloads its binary the first time a source-map upload runs, and `core-js` only prints a funding banner.

### Build-time environment

- `GITHUB_TOKEN` (any token with public read scope) renders the GitHub profile card from the GraphQL API. Without it the site still builds and shows a contact fallback.
- `POST_HOG_TOKEN` and `POST_HOG_URL` turn on analytics. If either is missing the SDK never loads, so local and CI builds send nothing.
- `POSTHOG_API_KEY` (a personal key with error-tracking write) and `POSTHOG_PROJECT_ID` turn on source-map uploads.
- `RESUME_PHONE` adds a phone line to the resume (see [Resume](src/README.md#resume)).

```bash
GITHUB_TOKEN=ghp_xxx bun run build
```

## Browser support

The site supports Chrome and Edge 123+, Firefox 128+ and Safari 17.5+ (iOS included). `BROWSER_TARGETS` in `astro.config.ts` holds the list, and the build compiles CSS for it, adding the prefixes and fallbacks those browsers need, so change both when a feature raises the floor. JavaScript isn't lowered (Astro builds client code as `esnext`), so new syntax and APIs need the same check by hand. What sets each floor:

- `light-dark()`, which holds every light/dark colour pair (Chrome 123, Firefox 120, Safari 17.5). Older browsers drop the whole declaration, so the page loses its colours.
- Tailwind 4 (Chrome 111, Firefox 128, Safari 16.4).
- The phone menu's Popover API (Chrome 114, Firefox 125, Safari 17). Without it the menu button hides.

Two features improve where supported and degrade cleanly. The phone menu's slide uses `@starting-style` (Firefox 129) and `overlay` (Chromium only): Safari and newer Firefox snap shut, and Firefox 128 also snaps open. The chat composer grows with `field-sizing` (Chrome 123, Firefox 152, Safari 26.2); elsewhere it stays one line and scrolls.

## Checks

```bash
bun run check-format   # oxfmt, plus prettier for .astro
typos                  # spelling, configured in _typos.toml
bun run lint           # astro sync, oxlint (type-aware via oxlint-tsgolint), then ESLint on .astro templates
bun run knip           # unused files, exports and dependencies
bun run types          # regenerate worker-configuration.d.ts from wrangler.jsonc (Env plus the runtime types)
bun run check:src      # type-check src/ (.astro files included), scripts/ and the config files
bun run check:worker   # type-check worker/
bun run test           # vitest in the workers pool, on Node and in headless Chromium
bun run test --coverage # the same, plus Istanbul coverage in coverage/
```

[typos](https://github.com/crate-ci/typos) is a Rust binary, not an npm package, so install it once with `brew install typos-cli`. CI runs it through `crate-ci/typos`, pinned in `ci.yml`.

The project compiler is a TypeScript 7.1 nightly, because 7.1 adds content mappers. `contentMappers` in `tsconfig.json` hands `.astro` files to `@astrojs/ts-content-mapper`, so `check:src` type-checks them with `tsc`. Content mappers only load with `--runExternalCode`. The compiler and the mapper are pinned exactly, since the protocol between them still changes between nightlies, and `renovate.json` groups them so they update together. Renovate offers the stable 7.1 release once it ships.

typescript-eslint (which parses `.astro` frontmatter for ESLint) refuses TypeScript 7, whose native build ships no JS compiler API. Microsoft publishes that API as `@typescript/typescript6`, and `lint:astro` preloads `scripts/site/ts-alias.cjs` to point `require("typescript")` at it. Remove `@typescript/typescript6` and `ts-alias.cjs` once typescript-eslint supports TypeScript 7.

Oxlint lints `.astro` frontmatter and `<script>` blocks but not the HTML template, because its JS plugins can't take a custom parser yet. `bun run lint` runs `eslint.config.ts`, with `eslint-plugin-astro`'s `recommended` and `jsx-a11y-recommended` sets, over the `.astro` files in `src/` to cover the templates. It lints nothing else, so its rules don't overlap oxlint's. Delete it, along with ESLint and its plugins, once oxlint can parse Astro templates.

Having both compilers installed has two side effects:

- The TypeScript 6 copy wins `node_modules/.bin/tsc`, so bare `bunx tsc` reports 6.0.3. The `check:*` scripts call `node node_modules/typescript/bin/tsc` by path to get 7.
- TypeScript 7 ships no `tsserver`, so an editor set to "use the workspace TypeScript version" picks up 6. Point it at the TypeScript 7 language service instead.

## Deployment

Cloudflare Workers Builds builds and deploys every push to `main`. GitHub Actions (`.github/workflows/ci.yml`) only runs checks: format, spelling, lint, unused code, type-checks, tests and a full build including the resume. It uploads the test coverage (`coverage/lcov.info`) to [Qlty](https://qlty.sh) over OIDC, so no token is stored. A failed upload, such as on a fork's pull request, doesn't fail the job.

`.github/workflows/links.yml` checks every link in the repo's markdown with [lychee](https://lychee.cli.rs) each Monday and fails on a broken one; its settings and the hosts it skips are in `lychee.toml`, and `lychee .` runs the same check locally (`brew install lychee`). `.github/workflows/lighthouse.yml` runs Lighthouse CI against the live site each Monday (the homepage, `/blog/` and one long post, three runs each) and fails when a category score on the median run (picked by performance) drops below its floor in `lighthouserc.yml`. It audits the deployed site rather than a local build, so the scores include Cloudflare's caching and compression. [Renovate](https://docs.renovatebot.com) (`renovate.json`, read by the Renovate GitHub app) opens dependency updates once a week and keeps actions pinned to a commit SHA with the version as a comment.

The build and deploy commands are dashboard settings on the Worker's page, not read from this repo:

- **Build command.** `bun run build`. Workers Builds installs dependencies from `bun.lock` before running it.
- **Deploy command.** `bun run deploy` (`wrangler deploy`), not a bare `wrangler deploy`. It applies pending D1 migrations from `./migrations` first. The Worker never issues DDL, so skipping this leaves the chat mirror writing to tables that don't exist.
- **Build env vars.** `BUN_VERSION` (match `packageManager`; the image's default Bun is too old), `GITHUB_TOKEN`, `REQUIRE_GITHUB_PROFILE=1` (fail the build instead of falling back when the profile fetch fails), `POST_HOG_TOKEN`, `POST_HOG_URL`, `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, and optionally `RESUME_PHONE`. Those the site code reads are declared in `env.schema` in `astro.config.ts`; the build fails on a malformed value.
- **Worker secrets.** `DEEPSEEK_API_KEY`, listed in `secrets.required` in `wrangler.jsonc` and set with `bunx wrangler secret put DEEPSEEK_API_KEY`. Locally it comes from `.dev.vars`.
- **Contact inbox.** `OPPORTUNITY_INBOX` is a var in `wrangler.jsonc`, and the `EMAIL` binding is locked to the same address (`destination_address`, which must be verified in Email Routing). Change both together.

## Credits

- Design language inspired by [Soumyajit4419's Portfolio](https://github.com/soumyajit4419/Portfolio). The hero desk illustration is adapted from it, recoloured to this site's navy theme.
- Originally based on [developerFolio](https://github.com/saadpasta/developerFolio).
