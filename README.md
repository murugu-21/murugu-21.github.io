# murugappan.dev

[![Code Coverage](https://qlty.sh/gh/murugu-21/projects/murugu-21.github.io/coverage.svg)](https://qlty.sh/gh/murugu-21/projects/murugu-21.github.io)

My portfolio and blog, live at https://murugappan.dev. It's an Astro site served by one Cloudflare Worker, which also runs the AI chat (Jarvis), a public API and an MCP server.

## Where things are

```text
apps/site/           the Astro site
apps/api/            the Worker: chat, API, MCP, audio, 404
apps/tts/            makes the blog's read-aloud audio, run by hand on a Mac
apps/brand/          the X profile banners
packages/content/    the site's content, including blog posts
packages/contracts/  types and schemas the site and the Worker share
packages/utils/      small shared helpers
tooling/             lint and format config
```

More detail lives next to the code:

- [Site](apps/site/src/README.md): folder layout, analytics, the resume.
- [Blog](packages/content/blog/README.md): writing a post, diagrams, tags.
- [Read-aloud audio](apps/tts/README.md)
- [Worker](apps/api/README.md): routes, the 404, Jarvis.
- [Public API](apps/api/src/modules/api/README.md) and [MCP server](apps/api/src/modules/mcp/README.md)
- [Contracts](packages/contracts/README.md) and [banners](apps/brand/README.md)

## Run it locally

```bash
bun install
bunx astro sync --root apps/site && bun run types   # once, after cloning
bun run dev       # site on :4399, Worker on :8787
bun run build     # builds the site, then the Worker
bun run preview   # serves the built site and Worker on :8787
```

Things that will trip you up:

- `dev` and `preview` both use port 8787. Stop one before starting the other.
- In `dev`, the Worker can't see the built pages, so the chat's page fetching and the 404 page don't work there. Use `preview` for those.
- To use the chat from `:4399`, add `PUBLIC_CHAT_HOST=localhost:8787` to `apps/site/.env`.
- Read-aloud audio in `dev` and `preview` comes from the Worker's local R2, which starts empty, so the Listen button falls back to the browser voice. Copy a post's `.mp3` and `.json` from `blog/breeze/` with `bunx wrangler r2 object get --remote`, then `put --local --persist-to .wrangler/state` from `apps/api`.
- `preview` runs the built Worker, so rebuild after changing `apps/api/src/` or `packages/content/`.
- Local settings go in `apps/site/.env` (site) and `apps/api/.dev.vars` (Worker).

## Imports

Packages import each other by name and full file path, like `@murugappan/content/posts.ts`. Inside an app, use the `#src/*` imports, plus `#test/*` for the Worker's test fixtures. Lint blocks `../` imports and controls which folder may import which (`LAYERS` in `tooling/lint.config.ts`). If lint blocks an import, the code probably belongs somewhere else. Logic both apps need goes in `packages/content/` or `packages/utils/`.

## Tests and checks

`.githooks/pre-push` runs every check CI runs. Both call `bun run check:static` for the format, lint and typecheck gates. It regenerates the Worker types from `wrangler.jsonc` first, because lint and the typechecks read bindings from them. It needs two tools from Homebrew: `brew install typos-cli uv`.

- Run tests with `bun run test`. `bun test` starts Bun's own test runner, which is the wrong one.
- `bun run test:e2e` runs `apps/api/e2e/` against `bun run build`'s output: it boots the built Worker in wrangler's dev runtime on a port wrangler picks and checks the served media types, Link headers, markdown negotiation, the links in the agent documents and the home page's JavaScript budget. Build first.
- Before the first run, install Chromium with `bunx playwright install --only-shell chromium` and set up Python with `uv sync --locked --project apps/tts`.
- `bun run test:live` runs the tests that call the real DeepSeek API. They cost money, so the normal run skips them.
- Bun installs packages, but Node runs Astro, Wrangler, Vitest and `tsc`.
- The type checker is a TypeScript 7 nightly. Point your editor at the TypeScript 7 language service.
- `bun run check:effect` runs Effect's diagnostics (`@effect/tsgo`) over `apps/api`. It fails on every Effect error and warning, and the plugin entry in `apps/api/tsconfig.json` raises more rules to errors. Without that entry it checks nothing and passes.
- Each `@effect/tsgo` release supports only the TypeScript versions its README lists, so `typescript` is pinned to one of them. Renovate bumps the two in one PR, which fails until you set `typescript` to a version the new `@effect/tsgo` lists.
- Oxlint and oxfmt cover TypeScript, JSON and Markdown. Oxfmt also formats `.astro` templates and sorts their Tailwind classes. Biome lints `.astro` templates and lints and formats CSS, which oxc can't parse (`biome.jsonc`).
- `tooling/oxlint/anti-slop/` is a vendored subset of [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), owned and linted as repo code. `UPSTREAM.md` there names the commit it came from, says how to copy another rule in, and lists what differs from upstream.
- Astro deletes a line break beside a tag or `{expression}`, so `on\n<a>` renders as `on<a>`. Write the space as `{" "}` at the end of the line. `tooling/astro-whitespace.test.ts` fails on a line break that joins two words and on a space just inside an inline element.
- In CSS, use the `--font-fira-code` variable, never `"Fira Code"`. The build renames the font.

## Build settings

These env vars change the build. All are optional locally.

- `GITHUB_TOKEN`: any token with public read access. It shows the GitHub card on the homepage.
- `POST_HOG_TOKEN` and `POST_HOG_URL`: turn on analytics.
- `POSTHOG_API_KEY` and `POSTHOG_PROJECT_ID`: upload source maps for error tracking.
- `RESUME_PHONE`: adds a phone number to the resume.
- `PUBLIC_TURNSTILE_SITE_KEY`: the Turnstile site key the chat widget passes before it connects. A build in Workers Builds fails without it, because the deployed chat would refuse every visitor. See [the Worker's README](apps/api/README.md#jarvis).

`bun run build` is cached, and the site build sees only the variables in `apps/site/build-env.ts`, so declare a new one there. A cached build keeps the GitHub card it fetched. Run `bunx vp cache clean` to fetch it again.

## Browser support

Chrome and Edge 123+, Firefox 128+ and Safari 17.5+, including iOS. Older browsers get sent to a notice page. Open `/outdated/?from=/about/` to see it.

The floor comes from `light-dark()` colours, Tailwind 4 and the Popover API in the phone menu. If you use a newer feature, either make it fail gracefully or raise the floor. Raising it means changing `MIN_VERSIONS` and `redirectIfOutdated` in `apps/site/src/lib/browser-support.ts` together.

## Deploying

Every push to `main` deploys. Cloudflare Workers Builds does the deploy, and GitHub Actions only runs checks. Weekly jobs check links and run Lighthouse against the live site, and Renovate opens dependency updates.

The build settings live in the Cloudflare dashboard, not in this repo:

- Build command `bun run build`. Deploy command `bun run deploy`, which applies D1 migrations before it deploys.
- Build env vars: the ones above, plus `BUN_VERSION` (match `packageManager` in `package.json`) and `REQUIRE_GITHUB_PROFILE=1` to fail the build if the GitHub card can't load.
- The Worker secret `DEEPSEEK_API_KEY`. Set it with `bunx wrangler secret put DEEPSEEK_API_KEY` from `apps/api`.

The contact inbox is `OPPORTUNITY_INBOX` in `apps/api/wrangler.jsonc`. The `EMAIL` binding's `destination_address` must be the same address, so change both together; `apps/api/test/wrangler.test.ts` checks that they match.

## Credits

- Design inspired by [Soumyajit4419's Portfolio](https://github.com/soumyajit4419/Portfolio). The hero desk illustration is adapted from it.
- Originally based on [developerFolio](https://github.com/saadpasta/developerFolio).
