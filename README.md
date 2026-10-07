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
bun run dev       # Astro dev server with the Worker in workerd, on :4399
bun run build     # site and Worker to .cloudflare/output, plus markdown renditions and the resume PDF
bun run preview   # the production build in workerd, API and chat included
```

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

Lint enforces the graph. `LAYERS` lists each layer's folder and the layers it may use, and generates a `no-restricted-imports` rule per layer from it. `import/no-relative-parent-imports` stops a `../` import from going around the subpath imports, contracts may not import a framework or Worker package, and `contracts/shapes-only` (`scripts/lint/contracts.ts`) rejects a function exported from `contracts/`. Logic goes in the layer that runs it, or in `utils/` when the site and the Worker both need it. The one exception is `scripts/worker/live-test-capture.ts`, which reads the built site's `llms.txt` through `scripts/site/site-dir.ts`, the same file Jarvis grounds on in production. To add a layer or let one use another, edit `LAYERS`. The root config files (`astro.config.ts`, `cloudflare.config.ts`, `vitest.config.ts`) belong to no layer, since they wire the layers together.

### Build

`@astrojs/cloudflare` builds the Worker (`worker/server.ts`, the `entrypoint` in `cloudflare.config.ts`) as part of `astro build`. It writes the Build Output to `.cloudflare/output`: the site under `v0/workers/default/assets`, the bundle and a `worker.config.json` with every binding. `cf deploy --prebuilt` uploads exactly that, so deploy only after a build.

Astro prerenders every page. The config still sets `output: "server"`, because with `"static"` the adapter emits an assets-only Worker and drops the custom `entrypoint` ([withastro/astro#18208](https://github.com/withastro/astro/issues/18208), closed as intended). The `prerender-every-route` integration in `astro.config.ts` then marks every route prerendered, so no page renders in the Worker. `astro` and `@astrojs/cloudflare` are pinned to the 7.4 and 15.0 betas.

`astro build` produces everything:

- Markdown renditions (`index.md` next to each `index.html`, served for `Accept: text/markdown`) are prerendered endpoints under `src/pages/**/index.md.ts`. They share `src/lib/llms.ts` with `/llms.txt`.
- Mermaid diagrams and the resume PDF come from the `build-artifacts` integration in `astro.config.ts`.
- The site font is Fira Code 6.2 from the author's `firacode` package. Its release ships only full fonts, so `scripts/site/fira-code-subset.ts` cuts a latin-plus-arrows subset into `node_modules/.cache/fira-code/` at config setup (dev and build). The Astro Fonts API serves it with a fallback sized to Fira Code's metrics (local Courier New), and `global.css` adds the same sizing for Droid Sans Mono, Cousine and Liberation Mono (Android, ChromeOS, Linux with Liberation Mono), so the swap doesn't rewrap text. `<Font>` in each `<head>` defines `--font-fira-code`; the family name is hashed, so reference the variable, never `"Fira Code"`.
- Scripts that read the build find it through `scripts/site/site-dir.ts`.
- Imports across top-level folders go through the `#src/*`, `#worker/*`, `#contracts/*`, `#utils/*` and `#scripts/*` subpath imports in `package.json`, with the file extension, because TypeScript resolves them only as exact paths. Node, Bun, Vite and TypeScript read them natively. Lint rejects `../` imports. Imports within a folder or its subfolders stay relative.

Cloudflare serves pages straight from static assets. The Worker runs only for its own routes (`runWorkerFirst` in `cloudflare.config.ts`) and for requests that match no asset (`notFoundHandling: "none"`), which get the negotiated 404 described under [Discovery](worker/README.md#discovery-documents-and-the-404).

### Bun and Node

[Bun](https://bun.sh) installs dependencies, runs the package scripts and runs the TypeScript in `scripts/` directly. Its version is pinned in `packageManager` in `package.json`. Node (version in `.nvmrc`) runs Astro, Vitest, `cf` and `tsc`, because `cloudflare.config.ts` refuses to load under Bun ("cloudflare.config.ts loading is not supported on Bun"). Under Bun, miniflare also cannot reach workerd ("Unable to connect. Is the computer able to access the url?" from `fetchWorkerExportTypes`) and `astro preview` hangs.

- `build`, `dev` and `preview` call `astro` on Node.
- `scripts/site/generate-resume.ts` runs on Node too, because it prints the resume from `astro preview`.
- `test` is `vitest run`. Tests run inside workerd through `@cloudflare/vitest-plugin`. Use `bun run test`, not `bun test`, which is Bun's own runner.

Bun blocks the install scripts of two packages here, and both are safe to leave blocked. `@posthog/cli` downloads its binary the first time a source-map upload runs, and `core-js` only prints a funding banner.

### Dev server quirks

- If the dev server starts on a warm `node_modules/.vite/deps_ssr` cache, an Astro/adapter bug turns every page into a 51-byte `/@vite/client` stub (`Unable to resolve […Layout.astro?astro&type=script&index=0&lang.ts]`). `astro.config.ts` sets `vite.environments.ssr.optimizeDeps.force` to re-optimize on every start, which costs about 3 s.
- In dev the Worker reads the `ASSETS` binding at `https://assets.local`. Vite's host check would answer those reads with a 403, so the host is listed in `vite.server.allowedHosts`.

### Build-time environment

- `GITHUB_TOKEN` (any token with public read scope) renders the GitHub profile card from the GraphQL API. Without it the site still builds and shows a contact fallback.
- `POST_HOG_TOKEN` and `POST_HOG_URL` turn on analytics. If either is missing the SDK never loads, so local and CI builds send nothing.
- `POSTHOG_API_KEY` (a personal key with error-tracking write) and `POSTHOG_PROJECT_ID` turn on source-map uploads.
- `RESUME_PHONE` adds a phone line to the resume (see [Resume](src/README.md#resume)).

```bash
GITHUB_TOKEN=ghp_xxx bun run build
```

## Checks

```bash
bun run check-format   # oxfmt, plus prettier for .astro
typos                  # spelling, configured in _typos.toml
bun run lint           # astro sync, oxlint (type-aware via oxlint-tsgolint), then ESLint on .astro templates
bun run knip           # unused files, exports and dependencies
bun run types          # regenerate .cloudflare/types from cloudflare.config.ts (Env plus the runtime types)
bun run check:astro    # type-check .astro files
bun run check:src      # type-check src/, scripts/ and the config files
bun run check:worker   # type-check worker/
bun run test           # vitest in the workers pool
bun run test --coverage # the same, plus Istanbul coverage in coverage/
```

[typos](https://github.com/crate-ci/typos) is a Rust binary, not an npm package, so install it once with `brew install typos-cli`. CI runs it through `crate-ci/typos`, pinned in `ci.yml`.

The project compiler is TypeScript 7. Its native build no longer ships the JS API that Astro's Volar-based tooling calls, so `astro check` crashes on it, and typescript-eslint (which parses `.astro` frontmatter for ESLint) refuses it. Microsoft publishes that API as `@typescript/typescript6`, and `check:astro` and `lint:astro` preload `scripts/site/ts-alias.cjs` to point `require("typescript")` at it. `@astrojs/check` also declares a `typescript@^5 || ^6` peer, hence the `overrides` entry in `package.json`. Remove `@typescript/typescript6`, `scripts/site/ts-alias.cjs` and the `overrides` entry once `@astrojs/check` and typescript-eslint support TypeScript 7.

Oxlint lints `.astro` frontmatter and `<script>` blocks but not the HTML template, because its JS plugins can't take a custom parser yet. `bun run lint` runs `eslint.config.ts`, with `eslint-plugin-astro`'s `recommended` and `jsx-a11y-recommended` sets, over the `.astro` files in `src/` to cover the templates. It lints nothing else, so its rules don't overlap oxlint's. Delete it, along with ESLint and its plugins, once oxlint can parse Astro templates.

Having both compilers installed has two side effects:

- The TypeScript 6 copy wins `node_modules/.bin/tsc`, so bare `bunx tsc` reports 6.0.3. The `check:*` scripts call `node node_modules/typescript/bin/tsc` by path to get 7.
- TypeScript 7 ships no `tsserver`, so an editor set to "use the workspace TypeScript version" picks up 6. Point it at the TypeScript 7 language service instead.

## Deployment

Cloudflare Workers Builds builds and deploys every push to `main`. GitHub Actions (`.github/workflows/ci.yml`) only runs checks: format, spelling, lint, unused code, type-checks, tests and a full build including the resume. It uploads the test coverage (`coverage/lcov.info`) to [Qlty](https://qlty.sh) over OIDC, so no token is stored. A failed upload, such as on a fork's pull request, doesn't fail the job.

`.github/workflows/links.yml` checks every link in the repo's markdown with [lychee](https://lychee.cli.rs) each Monday and fails on a broken one; its settings and the hosts it skips are in `lychee.toml`, and `lychee .` runs the same check locally (`brew install lychee`). [Renovate](https://docs.renovatebot.com) (`renovate.json`, read by the Renovate GitHub app) opens dependency updates once a week and keeps actions pinned to a commit SHA with the version as a comment.

The build and deploy commands are dashboard settings on the Worker's page, not read from this repo:

- **Build command.** `bun run build`. Workers Builds installs dependencies from `bun.lock` before running it.
- **Deploy command.** `bun run deploy` (`cf deploy --prebuilt`), not a bare `cf deploy`. It applies pending D1 migrations from `./migrations` first. The Worker never issues DDL, so skipping this leaves the chat mirror writing to tables that don't exist.
- **Build env vars.** `BUN_VERSION` (match `packageManager`; the image's default Bun is too old), `GITHUB_TOKEN`, `REQUIRE_GITHUB_PROFILE=1` (fail the build instead of falling back when the profile fetch fails), `POST_HOG_TOKEN`, `POST_HOG_URL`, `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, and optionally `RESUME_PHONE`. Those the site code reads are declared in `env.schema` in `astro.config.ts`; the build fails on a malformed value.
- **Worker secrets.** `DEEPSEEK_API_KEY`, declared as `bindings.secret()` in `cloudflare.config.ts` and set with `bunx cf workers secrets update DEEPSEEK_API_KEY`. Locally it comes from `.dev.vars`.
- **Contact inbox.** `OPPORTUNITY_INBOX` is a text binding in `cloudflare.config.ts`, and the `EMAIL` binding is locked to the same address (`destinationAddress`, which must be verified in Email Routing). Both read one constant, so they can't differ.

## Credits

- Design language inspired by [Soumyajit4419's Portfolio](https://github.com/soumyajit4419/Portfolio). The hero desk illustration is adapted from it, recoloured to this site's navy theme.
- Originally based on [developerFolio](https://github.com/saadpasta/developerFolio).
