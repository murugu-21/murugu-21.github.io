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
- [Public API](apps/api/src/api/README.md) and [MCP server](apps/api/src/mcp/README.md)
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
- `preview` runs the built Worker, so rebuild after changing `apps/api/src/` or `packages/content/`.
- Local settings go in `apps/site/.env` (site) and `apps/api/.dev.vars` (Worker).

## Imports

Packages import each other by name and full file path, like `@murugappan/content/posts.ts`. Inside an app, use the `#src/*` imports. Lint blocks `../` imports and controls which folder may import which (`LAYERS` in `tooling/lint.config.ts`). If lint blocks an import, the code probably belongs somewhere else. Logic both apps need goes in `packages/content/` or `packages/utils/`.

## Tests and checks

`.githooks/pre-push` runs every check CI runs. It needs two tools from Homebrew: `brew install typos-cli uv`.

- Run tests with `bun run test`. `bun test` starts Bun's own test runner, which is the wrong one.
- Before the first run, install Chromium with `bunx playwright install --only-shell chromium` and set up Python with `uv sync --locked --project apps/tts`.
- `bun run test:live` runs the tests that call the real DeepSeek API. They cost money, so the normal run skips them.
- Bun installs packages, but Node runs Astro, Wrangler, Vitest and `tsc`.
- The type checker is a TypeScript 7 nightly. A TypeScript 6 copy is installed for ESLint, so bare `bunx tsc` runs version 6, and your editor may pick up 6 too. Point the editor at the TypeScript 7 language service. The `check:*` scripts call the right one.
- ESLint only covers `.astro` templates and CSS. Oxlint covers the rest.
- In CSS, use the `--font-fira-code` variable, never `"Fira Code"`. The build renames the font.

## Build settings

These env vars change the build. All are optional locally.

- `GITHUB_TOKEN`: any token with public read access. It shows the GitHub card on the homepage.
- `POST_HOG_TOKEN` and `POST_HOG_URL`: turn on analytics.
- `POSTHOG_API_KEY` and `POSTHOG_PROJECT_ID`: upload source maps for error tracking.
- `RESUME_PHONE`: adds a phone number to the resume.

## Browser support

Chrome and Edge 123+, Firefox 128+ and Safari 17.5+, including iOS. Older browsers get sent to a notice page. Open `/outdated/?from=/about/` to see it.

The floor comes from `light-dark()` colours, Tailwind 4 and the Popover API in the phone menu. If you use a newer feature, either make it fail gracefully or raise the floor. Raising it means changing `MIN_VERSIONS` and `redirectIfOutdated` in `apps/site/src/lib/browser-support.ts` together.

## Deploying

Every push to `main` deploys. Cloudflare Workers Builds does the deploy, and GitHub Actions only runs checks. Weekly jobs check links and run Lighthouse against the live site, and Renovate opens dependency updates.

The build settings live in the Cloudflare dashboard, not in this repo:

- Build command `bun run build`. Deploy command `bun run deploy`, which applies D1 migrations before it deploys.
- Build env vars: the ones above, plus `BUN_VERSION` (match `packageManager` in `package.json`) and `REQUIRE_GITHUB_PROFILE=1` to fail the build if the GitHub card can't load.
- The Worker secret `DEEPSEEK_API_KEY`. Set it with `bunx wrangler secret put DEEPSEEK_API_KEY` from `apps/api`.

The contact inbox is `OPPORTUNITY_INBOX` in `apps/api/wrangler.jsonc`. The `EMAIL` binding's `destination_address` must be the same address, so change both together.

## Credits

- Design inspired by [Soumyajit4419's Portfolio](https://github.com/soumyajit4419/Portfolio). The hero desk illustration is adapted from it.
- Originally based on [developerFolio](https://github.com/saadpasta/developerFolio).
