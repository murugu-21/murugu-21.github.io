# murugappan.dev

Personal portfolio and blog of Murugappan, built with [Astro 7](https://astro.build) and deployed as one Cloudflare Worker.

**Live site:** https://murugappan.dev

One Astro project serves both halves. Blog routes live in `src/pages/blog/`, so the `/blog` prefix comes from file position, not an Astro `base`. Every page except the print-only résumé renders through `src/layouts/Layout.astro`, whose `section` prop picks the portfolio or blog head defaults and page classes. The rest of `src/` is grouped by type, with blog-only code in a `blog/` folder inside each type folder (see [Source layout](#source-layout)), and posts are markdown in `content/blog/<slug>/index.md`. Both halves share the light/dark theme through the `isDark` localStorage key.

## Development

```bash
bun install
bunx astro sync && bun run types   # once after cloning; lint and the typechecks need the generated types
bun run dev       # Astro dev server with the Worker in workerd, on :4399
bun run build     # site and Worker to .cloudflare/output, plus markdown renditions and the resume PDF
bun run preview   # the production build in workerd, API and chat included
```

### Source layout

`src/` is grouped by type first. Astro reserves only `src/pages/`, and the other folders follow its documented defaults.

```text
src/pages/        # routes
src/layouts/      # Layout.astro (every page) and BlogLayout.astro
src/components/   # site chrome shared by every page (Header, Icon, ThemeToggle, …)
  home/           # homepage sections and the pieces only they use
  blog/           # blog-only components
  chat/           # the Jarvis widget, on every page
  ui/             # shadcn primitives
src/lib/          # shared logic (site constants, theme, analytics, llms.txt)
  blog/           # blog-only logic
src/styles/       # global.css and the stylesheets it pulls in, plus prose.css
  blog/           # blog-only styles
src/data/         # hand-written portfolio and resume data
```

A file lives in the narrowest folder that holds every importer: a component only the homepage uses goes in `home/`, and one both halves use stays at the root of `components/`.

Lint enforces the direction (`no-restricted-imports` in `.oxlintrc.json`). Shared code never imports from a `blog/` or `home/` folder, and blog code never imports homepage components. The homepage may import blog code, since it shows the featured posts. Pages compose both halves freely, and so does `lib/llms.ts`, which renders the whole site for agents.

### Build

`@astrojs/cloudflare` builds the Worker (`worker/server.ts`, the `entrypoint` in `cloudflare.config.ts`) as part of `astro build`. It writes the Build Output to `.cloudflare/output`: the site under `v0/workers/default/assets`, the bundle and a `worker.config.json` with every binding. `cf deploy --prebuilt` uploads exactly that, so deploy only after a build.

Astro prerenders every page. The adapter still builds the Worker because the config names a custom `entrypoint`, which needs [withastro/astro#18209](https://github.com/withastro/astro/pull/18209). Without it, `@astrojs/cloudflare` 15.0.0-beta.1 deploys the static site and drops the Worker ([#18208](https://github.com/withastro/astro/issues/18208)). The adapter is pinned to a `pkg.pr.new` build of that PR, published from the `preview/18209` branch of the `murugu-21/astro` fork because Astro's preview workflow skips fork PRs; move to the first release that ships it. `astro` is pinned to the matching 7.4 beta.

`astro build` produces everything:

- Markdown renditions (`index.md` next to each `index.html`, served for `Accept: text/markdown`) are prerendered endpoints under `src/pages/**/index.md.ts`. They share `src/lib/llms.ts` with `/llms.txt`.
- Mermaid diagrams and the resume PDF come from the `build-artifacts` integration in `astro.config.ts`.
- The site font is Fira Code 6.2 from the author's `firacode` package. Its release ships only full fonts, so `scripts/fira-code-subset.ts` cuts a latin-plus-arrows subset into `node_modules/.cache/fira-code/` at config setup (dev and build). The Astro Fonts API serves it with a fallback sized to Fira Code's metrics (local Courier New), and `global.css` adds the same sizing for Droid Sans Mono, Cousine and Liberation Mono (Android, ChromeOS, Linux with Liberation Mono), so the swap doesn't rewrap text. `<Font>` in each `<head>` defines `--font-fira-code`; the family name is hashed, so reference the variable, never `"Fira Code"`.
- Scripts that read the build find it through `scripts/site-dir.ts`.
- Helpers with no app logic (`utils/`, such as the zod JSON helpers) are shared by the Worker and `scripts/`. Lint stops scripts from importing `worker/` directly.
- Imports across top-level folders go through the `#src/*`, `#worker/*`, `#utils/*` and `#scripts/*` subpath imports in `package.json`, with the file extension, because TypeScript resolves them only as exact paths. Node, Bun, Vite and TypeScript read them natively. Lint rejects `../` imports. Imports within a folder or its subfolders stay relative.

Cloudflare serves pages straight from static assets. The Worker runs only for its own routes (`runWorkerFirst` in `cloudflare.config.ts`) and for requests that match no asset (`notFoundHandling: "none"`), which get the negotiated 404 described under [Discovery](#discovery-documents-and-the-404).

### Bun and Node

[Bun](https://bun.sh) installs dependencies, runs the package scripts and runs the TypeScript in `scripts/` directly. Its version is pinned in `packageManager` in `package.json`. Node (version in `.nvmrc`) runs Astro, Vitest, `cf` and `tsc`, because `cloudflare.config.ts` refuses to load under Bun ("cloudflare.config.ts loading is not supported on Bun"). Under Bun, miniflare also cannot reach workerd ("Unable to connect. Is the computer able to access the url?" from `fetchWorkerExportTypes`) and `astro preview` hangs.

- `build`, `dev` and `preview` call `astro` on Node.
- `scripts/generate-resume.ts` runs on Node too, because it prints the resume from `astro preview`.
- `test` is `vitest run`. Tests run inside workerd through `@cloudflare/vitest-plugin`. Use `bun run test`, not `bun test`, which is Bun's own runner.

Bun blocks the install scripts of two packages here, and both are safe to leave blocked. `@posthog/cli` downloads its binary the first time a source-map upload runs, and `core-js` only prints a funding banner.

### Dev server quirks

- If the dev server starts on a warm `node_modules/.vite/deps_ssr` cache, an Astro/adapter bug turns every page into a 51-byte `/@vite/client` stub (`Unable to resolve […Layout.astro?astro&type=script&index=0&lang.ts]`). `astro.config.ts` sets `vite.environments.ssr.optimizeDeps.force` to re-optimize on every start, which costs about 3 s.
- In dev the Worker reads the `ASSETS` binding at `https://assets.local`. Vite's host check would answer those reads with a 403, so the host is listed in `vite.server.allowedHosts`.

### Build-time environment

- `GITHUB_TOKEN` (any token with public read scope) renders the GitHub profile card from the GraphQL API. Without it the site still builds and shows a contact fallback.
- `POST_HOG_TOKEN` and `POST_HOG_URL` turn on analytics. If either is missing the SDK never loads, so local and CI builds send nothing.
- `POSTHOG_API_KEY` (a personal key with error-tracking write) and `POSTHOG_PROJECT_ID` turn on source-map uploads.
- `RESUME_PHONE` adds a phone line to the resume (see [Resume](#resume)).

```bash
GITHUB_TOKEN=ghp_xxx bun run build
```

## Checks

```bash
bun run check-format   # oxfmt, plus prettier for .astro
bun run lint           # astro sync, then oxlint (type-aware via oxlint-tsgolint)
bun run types          # regenerate .cloudflare/types from cloudflare.config.ts (Env plus the runtime types)
bun run check:astro    # type-check .astro files
bun run check:src      # type-check src/, scripts/ and the config files
bun run check:worker   # type-check worker/
bun run test           # vitest in the workers pool
```

The project compiler is TypeScript 7. Its native build no longer ships the JS API that Astro's Volar-based tooling calls, so `astro check` crashes on it. Microsoft publishes that API as `@typescript/typescript6`, and `check:astro` preloads `scripts/ts-alias.cjs` to point Volar's `require("typescript")` at it. `@astrojs/check` also declares a `typescript@^5 || ^6` peer, hence the `overrides` entry in `package.json`. Remove `@typescript/typescript6`, `scripts/ts-alias.cjs` and the `overrides` entry once `@astrojs/check` supports TypeScript 7.

Having both compilers installed has two side effects:

- The TypeScript 6 copy wins `node_modules/.bin/tsc`, so bare `bunx tsc` reports 6.0.3. The `check:*` scripts call `node node_modules/typescript/bin/tsc` by path to get 7.
- TypeScript 7 ships no `tsserver`, so an editor set to "use the workspace TypeScript version" picks up 6. Point it at the TypeScript 7 language service instead.

## Deployment

Cloudflare Workers Builds builds and deploys every push to `main`. GitHub Actions (`.github/workflows/ci.yml`) only runs checks: format, lint, type-checks, tests and a full build including the resume.

The build and deploy commands are dashboard settings on the Worker's page, not read from this repo:

- **Build command.** `bun run build`. Workers Builds installs dependencies from `bun.lock` before running it.
- **Deploy command.** `bun run deploy` (`cf deploy --prebuilt`), not a bare `cf deploy`. It applies pending D1 migrations from `./migrations` first. The Worker never issues DDL, so skipping this leaves the chat mirror writing to tables that don't exist.
- **Build env vars.** `BUN_VERSION` (match `packageManager`; the image's default Bun is too old), `GITHUB_TOKEN`, `REQUIRE_GITHUB_PROFILE=1` (fail the build instead of falling back when the profile fetch fails), `POST_HOG_TOKEN`, `POST_HOG_URL`, `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, and optionally `RESUME_PHONE`. Those the site code reads are declared in `env.schema` in `astro.config.ts`; the build fails on a malformed value.
- **Worker secrets.** `DEEPSEEK_API_KEY`, declared as `bindings.secret()` in `cloudflare.config.ts` and set with `bunx cf workers secrets update DEEPSEEK_API_KEY`. Locally it comes from `.dev.vars`.
- **Contact inbox.** `OPPORTUNITY_INBOX` is a text binding in `cloudflare.config.ts`, and the `EMAIL` binding is locked to the same address (`destinationAddress`, which must be verified in Email Routing). Both read one constant, so they can't differ.

## Analytics

[PostHog](https://posthog.com); see [Build-time environment](#build-time-environment) for the env vars that turn it on. Replay and error tracking must also be enabled in the PostHog project.

- **Ingestion.** Events go through `https://e.murugappan.dev`, PostHog's managed reverse proxy. It is a CNAME to `…cf-prod-us-proxy.proxyhog.com` (US region), set as the SDK's `api_host`. Nothing in this repo or the Worker sits in that path. The DNS record must stay **DNS only (grey cloud)**, because proxying it breaks PostHog's certificate issuance. `ui_host` stays `https://us.posthog.com` so the toolbar works.
- **Loading.** `posthog-js` is `import()`ed as its own chunk on the first input, or after 10 s without one (`scheduleSdkLoad`), so it stays outside Lighthouse's measured window. The token and host reach the client through `<meta name="ph-token">` and `<meta name="ph-host">`, because Astro bundles `<script>` as a module, where `document.currentScript` is `null`. They're read at build time, so the env vars need no `PUBLIC_` prefix.
- **Session replay** starts on the first pointer, touch, key or wheel event (`onFirstInteraction` in `src/lib/first-interaction.ts`), not on `scroll`, which Chrome fires during load. The recorder is the SDK's heaviest extension, and loading it right after paint counted against Lighthouse's blocking time. Surveys and dead-click capture are off, so the SDK doesn't fetch their scripts.
- **Error tracking.** `capture_exceptions: true` turns uncaught errors and rejections into `$exception` events. Since the SDK waits for the first interaction, `bootAnalytics` listens for `error` and `unhandledrejection` from page load, buffers them, replays them once the SDK arrives, then detaches. Errors the code catches on purpose go through `reportError`.
- **Source maps.** In production builds `@posthog/rollup-plugin` emits hidden source maps, uploads them and deletes the `.map` files, so nothing extra is served. A failed upload fails the build rather than deploying unmapped code.
- **Privacy.** Nothing a visitor types is sent. Replay masks every `<input>` and `<textarea>`, and the chat transcript carries `data-ph-mask="true"` because sent messages render as `<div>`s. Blog filter params (`?q=`, `?tag=`) are stripped from captured URLs (`redactBlogFilters` / `sanitize_properties`).

### Custom events

`src/lib/analytics.ts` wraps PostHog for both halves:

- `track(event, props?)` captures an event.
- `tag(key, value)` registers a super property, which suits anonymous visitors better than person properties.
- `reportError(error, props?)` sends a caught error.

Each one no-ops without the SDK, buffers while it loads and swallows failures, so they're safe to call anywhere. Pageviews, autocapture and heatmaps come from PostHog itself.

Links opt in with `data-ph-event` and optional `data-ph-prop` / `data-ph-value`. A single delegated `click` listener per document handles them, React-rendered markup included. `src/components/SiteScripts.astro`, which `src/layouts/Layout.astro` includes on every page, calls `initClickTracking()`.

| Event                                            | Fired on                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `resume_download`                                | "Download my resume" (also upgrades the session recording)                        |
| `contact_click`                                  | "Contact me"                                                                      |
| `social_click`                                   | any outbound profile link, tagged `social=github\|linkedin\|email\|phone\|x\|rss` |
| `project_click`                                  | a pinned-repo card, tagged `project=<repo>`                                       |
| `more_projects_click`                            | "More Projects"                                                                   |
| `oss_link_click`                                 | an open-source card link, tagged `oss=<name>`                                     |
| `blog_card_click`                                | a homepage blog card, tagged `post=<title>`                                       |
| `chat_open`                                      | the Jarvis launcher is opened                                                     |
| `chat_starter_click`                             | a suggested starter chip                                                          |
| `chat_message_sent`                              | a message is sent (the first also upgrades the recording)                         |
| `chat_limit` / `chat_error`                      | the room replies with a rate limit or an error                                    |
| `chat_restart` / `chat_transcript_download`      | conversation menu actions                                                         |
| `listen_play`                                    | first play on a post, tagged `post=<slug>`                                        |
| `listen_resume` / `listen_pause` / `listen_seek` | transport controls (seek fires once per scrub)                                    |
| `listen_rate`                                    | playback speed changed, tagged `listen_rate=<n>x`                                 |
| `listen_complete`                                | the post was read to the end                                                      |
| `listen_audio_fallback`                          | pre-rendered audio failed and speech synthesis took over                          |
| `listen_unavailable`                             | no backend at all (should never fire: the control hides itself)                   |

Super properties: `theme` (`dark` / `light`, set on load and on every toggle) and `listen_backend` (`audio` / `speech`).

## Resume

`/resume` (`src/pages/resume.astro`) is a print-styled page built entirely from `src/data/portfolio.ts` and `src/data/resume.ts`, so it can't drift from the site.

At the end of `bun run build`, `scripts/generate-resume.ts` starts `astro preview` on a fixed port, opens `/resume/` in headless Chromium through Puppeteer and prints `resume.pdf`. It then parses the PDF with `pdf-parse` and fails the build if any ATS-critical string (name, email, section headings, current title, headline stats) isn't extractable text. On Workers Builds, which has no system Chrome, it falls back to `@sparticuz/chromium`.

No phone number is in source. Set `RESUME_PHONE` (Workers Builds env in production, `.env` locally) to add one; leaving it unset omits the line. The contact section in `GithubCard.astro` reads it only in its no-GitHub fallback, which production never renders.

## Blog

```text
content/blog/          # one directory per post: <slug>/index.md (+ images)
  draft/               # drafts: visible in dev, excluded from production builds
src/pages/blog/        # index, [...slug] post pages, 404, rss.xml, llms.txt, llms-full.txt
src/layouts/BlogLayout.astro  # the blog header around Layout
src/components/blog/   # search, tags, table of contents, Listen control, bio
src/lib/blog/          # post helpers, the markdown plugins, read-aloud text prep
src/styles/blog/       # post and code-block styles
src/content.config.ts  # content collection schema
public/blog/           # static files served verbatim (og-image, sw.js)
```

The index mirrors its search box and tag chips into the URL (`/blog/?q=…&tag=…`, one `tag` per chip), so filtered views survive a reload and can be shared. Post pages link their tags to the same URLs. Unknown tags are ignored.

### Writing a post

Create `content/blog/<slug>/index.md`. The directory name is the slug, so the post appears at `/blog/<slug>/` and in the sitemap, RSS feed, both `llms.txt` files and the markdown renditions.

```yaml
---
title: My post title
date: "2026-06-10T10:00:00.000Z"
tags: ["system-design"]
keywords: ["kafka", "outbox"] # optional: SEO and search terms, never shown as chips
featured: true # optional: a card in the homepage's Blogs section, newest first
shortTitle: Short title # optional: the card's title when the full one runs past two lines
description: One-line description shown in lists, search and feeds.
---
```

- **Images** next to `index.md` can be referenced relatively (`![alt](image.png)`) and are optimized at build time.
- **Headings.** On wide screens, `##` and `###` headings feed the table-of-contents rail (`TableOfContents.astro`). Posts with fewer than two get no rail. Use `---` as a separator, never an empty `##`.
- **Code** fences are highlighted at build time by Shiki in Night Owl, adjusted for AA contrast and without italics (`src/lib/blog/code-themes.ts`). Name the language (` ```ts `), or the fence renders as plain text.
- **Mermaid** fences render at build time, not in the browser.

### Mermaid diagrams

`scripts/render-mermaid.ts` renders each ` ```mermaid ` fence to a light and a dark SVG (with a Fira Code subset embedded, so labels measure the same inside `<img>`) and a light PNG, under `content/blog/<slug>/diagrams/`, named by a hash of the fence. It prunes renderings no fence uses.

The renderings are gitignored; only the fence source is committed. `bun run build` renders them first, the markdown plugin renders any fence that has no rendering yet (useful under `astro dev`), and `bun run diagrams` renders on demand. Each file records the mermaid version that rendered it, so an upgrade re-renders automatically; `--force` re-renders everything. If you change the renderer's own output (theme, font), bump `RENDERER_VERSION` in `src/lib/blog/mermaid-diagrams.ts` so the hashes change.

The RSS feed uses the PNG. Feed readers and mirrors like dev.to rasterize images without an HTML engine or web fonts, so mermaid's `foreignObject` labels come out blank in the SVG.

The `blogPostChecks` integration in `astro.config.ts` checks after the build that every post rendered one figure per fence. Without it, a markdown failure would ship a blank article, because the content layer only logs the error and caches the empty result in `node_modules/.astro`. It also checks each post's head: exactly one canonical URL, the post's own, and a `BlogPosting` whose author resolves to the `Person` in the same JSON-LD `@graph`.

### Tag vocabulary

Tags are the index's filter chips, so they name broad reader intents that recur across posts. `src/content.config.ts` constrains them (an unknown tag fails the build): **1 to 3 per post, lowercase, kebab-case, singular, no vendor names**. Precise terms (`kafka`, `debezium`, `floating-point`) go in `keywords`, which feeds JSON-LD, `article:tag` and the search index but never renders as a chip.

| Tag             | What it covers                                          |
| --------------- | ------------------------------------------------------- |
| `ai`            | LLM agents, AI-assisted development                     |
| `algorithms`    | DSA and interview-style problem solving                 |
| `backend`       | Server-side engineering, APIs                           |
| `career`        | Learning, tooling, becoming a developer                 |
| `databases`     | Postgres, streaming, CDC, data plumbing                 |
| `fundamentals`  | First-principles posts: floating point, closures, scope |
| `javascript`    | Applied JS and language deep dives                      |
| `react`         | React mental models and the ecosystem                   |
| `system-design` | Distributed architecture: queues, scaling, event-driven |

To add a tag, add it to `BLOG_TAGS` in `src/content.config.ts`, document it here and tag the posts it covers. Chips come from post counts, so an unused tag stays hidden.

### Read-aloud audio

Every post has a **Listen** control. When `/blog/audio/<slug>.json` exists, the page plays a pre-rendered MP3 and highlights the paragraph (or word) being read. Otherwise it falls back to the browser's speech synthesis, which highlights words from `boundary` events.

Audio generation runs **on a laptop, never in CI**, because the model is 3.9 GB and needs Apple Silicon.

**Pipeline** (`scripts/generate-audio.ts`):

1. Extract text from the built HTML with the same `speechBlocks()` the page uses, then normalize emoji, punctuation and long digit runs. Breeze loops on runs like `0.30000000000000004`, so `normalizeSpeechText` describes them instead of reading them out.
2. Synthesize sentence groups of at most 300 characters with Breeze TTS 2 ([mlx-community/Breeze-TTS-2-mlx-8bit](https://huggingface.co/mlx-community/Breeze-TTS-2-mlx-8bit) via [mlx-audio](https://github.com/Blaizzy/mlx-audio), `scripts/tts/synth.py`), cloning `.voice/reference.wav` with no instruction prompt. Use the 8-bit build; bf16 swaps on a 24 GB machine.
3. Speed up each chunk (`atempo=1.08`), join with 0.15 s gaps inside a paragraph and 0.45 s between paragraphs, and normalize loudness (`loudnorm I=-16`).
4. Upload a 64 kbps MP3 and a `{blocks:[{text,start,end}]}` JSON to the R2 bucket `murugappan-dev-audio` (`infra/main.tf`, bound as `AUDIO`) under `blog/breeze/`. `worker/audio.ts` serves them with Range and ETag support.

The script skips posts whose spoken text hasn't changed. The `blog/<slug>.*` objects in R2 are unused and safe to delete.

The voice reference is a synthetic clip designed once from the persona prompt in `scripts/tts/design-voice.py`, so every paragraph clones the same clean source. Breeze TTS 2 weights are under the BreezeBlue Research and Non-Commercial License, which this personal blog satisfies.

**One-time setup**

```bash
terraform -chdir=infra apply   # creates the R2 bucket
brew install ffmpeg
python3.13 -m venv .venv-tts && .venv-tts/bin/pip install -r scripts/tts/requirements.txt
.venv-tts/bin/python scripts/tts/design-voice.py 3   # writes .voice/candidates/{0,1,2}.wav from the persona prompt
cp .voice/candidates/<k>.wav .voice/reference.wav && cp .voice/candidates/reference.txt .voice/reference.txt
bun run audio --upload-voice     # durable copy in R2
```

To reuse the current voice instead, skip the design step: `bun run audio` restores `.voice/` from `voice/breeze/` in R2 when it's missing. The voice reference and venv are gitignored, and the reference is never served.

**Publishing a post**

```bash
bun run build && bun run audio <slug>   # ~2.8 s of compute per second of audio on an M4 Pro
bun run audio:align <slug>             # word timings, ~5 s per post
```

Then push as usual. With no slug, `bun run audio` renders every changed post. `--force` re-renders, `--dry-run` only extracts and hashes, and `--local` writes to the local R2 state that `bun run dev` serves (`.cloudflare/state`).

Every render stays in the `$TMPDIR/audio-<slug>-*` directory the script logs, about 370 MB for a 45-minute post, and nothing deletes it. If an upload fails, push the files from there instead of rendering again, MP3 first because the JSON's hash marks the post as done:

```bash
bunx cf r2 objects put blog/breeze/<slug>.mp3 --bucket-name murugappan-dev-audio --file <dir>/<slug>.mp3 --content-type audio/mpeg
bunx cf r2 objects put blog/breeze/<slug>.json --bucket-name murugappan-dev-audio --file <dir>/<slug>.json --content-type application/json
```

`bun run audio:align` (`scripts/align-audio.ts`) runs after synthesis, never at the same time. It slices each paragraph out of the MP3 in R2, gets word timestamps from [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper) (`whisper-large-v3-turbo`, 1.6 GB, downloaded automatically), maps them onto the known text (`src/lib/blog/audio-words.ts`) and rewrites the JSON as version 2 with a `words` array per paragraph.

## Public API (`/api/*`)

A public, unauthenticated JSON API over the site's content, for agents and developers. Documented at [`/developers`](https://murugappan.dev/developers/), [`/openapi.json`](https://murugappan.dev/openapi.json) (OpenAPI 3.1.0) and [`/AGENTS.md`](https://murugappan.dev/AGENTS.md).

- **Code.** It lives in `worker/api/`. `index.ts` is the Hono app, and Hono's own route table answers 405s. Request and response shapes are zod schemas next to the code that builds them (`dataset.ts`, `posts.ts`, `contact.ts`, `versioning.ts`, `errors.ts`), described with `.meta()`. `openapi.ts` generates the spec's component schemas from them, and a test checks the spec's paths against the router's. `store.ts` reads the data and `routes.ts` holds the paths.
- **Endpoints.** `GET /api/v1/profile`, `/experience`, `/skills`, `/education`, `/open-source`, `/posts` (`?q=`, `?limit=`), `/posts/{slug}` (full markdown), `/versions`, `POST /api/v1/contact`, and the spec at `/openapi.json` and `/api/v1/openapi.json`.
- **Versioning** (`worker/api/versioning.ts`). The version is a path segment. `server.ts` mounts the same Hono app at `/api/v1` and `/api`, so the unversioned alias serves exactly the v1 routes. The alias is permanently pinned to v1; a v2 would live only at `/api/v2/...`.
- **Deprecation.** Adding a record to `VERSIONS` turns on the `Deprecation` (RFC 9745) and `Sunset` (RFC 8594) headers, the `deprecation` / `successor-version` links and the `/api/v1/versions` document. `worker/api/middleware.ts` adds `API-Version`, `API-Supported-Versions` and the discovery `Link` relations to every response.
- **Rate limits** (`worker/api/ratelimit.ts`). Every response carries `RateLimit-Policy` and `RateLimit` (draft-ietf-httpapi-ratelimit-headers), mirrored as `X-RateLimit-*`, plus `Retry-After` on a 429. Reads allow 600 per 60 s per client, counted per isolate so they never wait on a Durable Object; the limit is therefore per edge location. Contact responses report the real daily allowance from `RateLimiter.takeContactSlot()` / `contactUsage()`.
- **One copy of the data.** `src/pages/api/dataset.json.ts` runs `src/data/portfolio.ts` and `resume.ts` through `buildDataset()` (`worker/api/dataset.ts`) and prerenders `api/dataset.json` into the site, which the Worker reads through `ASSETS`. Posts come from the root `llms.txt` and the per-post `index.md` renditions, and `/developers` renders its endpoint table from the served OpenAPI document, so none of them can drift from the source data.
- **Worker-owned paths.** `runWorkerFirst` in `cloudflare.config.ts` claims `/api/*`, `/openapi.json`, `/mcp*`, `/mcp.json`, `/.well-known/*`, `/agents/*` and `/blog/audio/*`. That keeps API errors in the JSON envelope rather than HTML, and lets generated discovery documents name the host that answered. Keep the list in sync with `worker/server.ts`.
- **`POST /api/v1/contact`.** It emails `OPPORTUNITY_INBOX` through the `send_email` binding the chat also uses. The `RateLimiter` Durable Object caps it at 3 per client IP per UTC day and 20 site-wide. `"dryRun": true` validates a payload without sending or using a slot. Without the EMAIL binding or inbox it answers 503.

## Discovery documents and the 404

These let an agent that has never seen the site find its way in, and recover from a wrong guess.

- **`/.well-known/api-catalog`** (`worker/well-known.ts`): an RFC 9727 API catalogue as an RFC 9264 link set (`application/linkset+json`). It has one entry for the REST API (anchored at `/api/v1`, with `service-desc` pointing to `/openapi.json`, `service-doc` to `/developers/` and `service-meta` to `/api/v1/versions`) and one for the MCP server. Pages advertise it with `Link: rel="api-catalog"` and a `<link>` in the layout head.
- **`/.well-known/mcp.json`** and **`/mcp.json`**: the MCP `server.json` manifest, following the published schema, with a reverse-DNS `name` (`dev.murugappan/murugappan-dev`), a `description` under the 100-character cap and one `streamable-http` remote. Extras go in `_meta` under a reverse-DNS key. It's generated, so the remote URL names the host that answered.
- **The 404** (`worker/not-found.ts`). With `not_found_handling: "none"`, every asset miss reaches the Worker, which negotiates on `Accept`. `text/html` gets the styled page (the blog's under `/blog/`, the site's elsewhere). Anything else, including no `Accept` header as sent by curl and `fetch`, gets a short markdown body that points to the sitemap, `llms.txt`, `AGENTS.md`, `/developers/`, the OpenAPI document, the API catalogue, the MCP manifest and the pages that exist. Both carry `Vary: Accept`, the discovery links and a real 404 status.

`public/_redirects` also 301s common guesses (`/docs`, `/api-docs`, `/developer`, `/api-reference`, `/mcp-server`) to `/developers/`.

## MCP server (`/mcp`)

The same content as a [Model Context Protocol](https://modelcontextprotocol.io) server. Add `https://murugappan.dev/mcp`: Streamable HTTP, `POST` only, no auth, no session.

- **Code.** It lives in `worker/mcp/` and runs on the official SDK, [`@modelcontextprotocol/server`](https://ts.sdk.modelcontextprotocol.io/v2/). `index.ts` is the Hono app: CORS, the Origin check, then a per-request `createMcpHandler` around an `McpServer` (per request because the tools read that request's bindings and client IP). The SDK owns JSON-RPC framing, version negotiation, `server/discover`, header and `_meta` validation, and input and output schema checks. `protocol.ts` holds the version list handed to the SDK (`/developers` shows it, and the manifest reads the latest one), the server name, and the Origin check, which allows any `http`/`https` origin where the SDK's own takes only a hostname allowlist. `tools.ts` holds the tools, each a thin adapter over `worker/api/store.ts`, and registers them. `resources.ts` registers the resources. Tool input and output schemas are the same zod schemas `worker/api/` validates with and generates its OpenAPI components from, so the SDK turns them into self-contained JSON Schemas, as the spec requires.
- **Protocol versions.** It implements revision `2026-07-28`: stateless, per-request `_meta`, `resultType`, mandatory `server/discover`, and mirrored `MCP-Protocol-Version` / `Mcp-Method` / `Mcp-Name` headers checked against the body (`-32020` on mismatch). It also accepts the `initialize` handshake of `2025-11-25`, `2025-06-18` and `2025-03-26`. Requests carrying `2026-07-28` `_meta` get that revision's behaviour; the rest go to the SDK's stateless legacy fallback, which answers over SSE and requires `Accept: application/json, text/event-stream` (406 otherwise). Every `POST` needs `Content-Type: application/json` (415 otherwise). Both `server/discover` and the `supported` field of a `-32022` error list per-request revisions only, so today they say just `2026-07-28`. No session is ever created, and `GET` / `DELETE` answer 405.
- **Tools.** `get_profile`, `list_experience`, `list_skills`, `list_education`, `list_open_source`, `search_blog_posts`, `get_blog_post`, `send_message`. `send_message` shares the contact endpoint's allowance and `dryRun`.
- **Resources** (`worker/mcp/resources.ts`): `/llms.txt`, `/AGENTS.md`, the generated `openapi.json`, `/blog/llms-full.txt`, one entry per post and a `{slug}` URI template. URIs use `https://` because clients can fetch them from the web. Reads go through an allowlist with a re-validated slug, and a missing resource is a `-32602` error with the URI in `data`.
- **Docs.** The MCP section of `/developers` renders its tool table from `MCP_TOOLS`, so it can't list a tool that doesn't exist.

## AI chat widget

Jarvis, an AI concierge on every portfolio and blog page.

- **Server.** `ChatRoom` (`worker/chat-room.ts`) is an `AIChatAgent` from `@cloudflare/ai-chat`, a Durable Object that keeps the transcript in its own SQLite and streams replies over a WebSocket at `/agents/chat-room/:roomId`. `worker/server.ts` routes only that socket and its `get-messages` history route, because `routeAgentRequest` alone would also expose `RateLimiter`. The socket is the widget's private channel, not a public API, and `/developers` says so.
- **Client frames.** `AIChatAgent` trusts the client's transcript. It persists whatever history a request carries, and a tool-result frame can start a model turn. `ChatRoom` wraps the SDK's message handler with an allowlist. It admits one new visitor text message (an unused id, `trigger: "submit-message"`), rebuilt on the room's stored history, plus the resume and cancel frames, and drops the rest. Interrupted turns aren't retried, because a retry bills DeepSeek again. `agents` and `@cloudflare/ai-chat` are 0.x and break in minor releases, so they're pinned exactly. Read their changesets before a bump, since the wrapper depends on how `AIChatAgent` installs its handler, and `worker/test/chat-room.test.ts` fails if a forged frame gets through.
- **Model.** DeepSeek `deepseek-flash`, the only provider. The name tracks DeepSeek's current Flash generation, so behaviour can change without a deploy. It authenticates with the `DEEPSEEK_API_KEY` secret. The AI SDK (`streamText` with `@ai-sdk/deepseek`) runs the tool loop. Thinking is on (`thinking: {type: "enabled"}`) to improve tool selection, and the reasoning never leaves the Worker. There's no `max_tokens` on purpose, because reasoning can use up a cap and leave an empty reply.
- **Changing the model.** Run `bun run test:capture` first. It drives a real lead-capture conversation against the live model and fails unless `capture_opportunity` is called with the visitor's contact detail. Unit tests can't catch a model that claims a capture it never made. It needs `.dev.vars` and a built `llms.txt`, and costs a fraction of a cent.
- **Loading.** The widget is a React island hydrated with `client:interaction`, a custom directive (`src/directives/interaction.ts`, registered in `astro.config.ts`) that loads React and the widget on the visitor's first input. A page that's only loaded, such as a Lighthouse run, never downloads it. A tap on the server-rendered launcher while the bundle is loading is remembered, and the panel opens once mounted.
- **Widget.** `src/components/chat/`, which the blog imports too. While a turn is in flight, `ActivityRow` shows a rotating label ("Discombobulating…") with an elapsed counter, then the real action when the reply gains an `activity` part ("Reading blog/…", "Noting your details"). The stream carries only prose, `activity` parts (a tool name and a page path) and `notice` parts (the spend limit or a failure). Tool arguments and results stay on the Worker. The row is `aria-hidden` behind a stable `sr-only` "Jarvis is typing", so the live region stays quiet.
- **Visitor context.** The Worker reads the country from the WebSocket upgrade (`request.cf.country`, falling back to `CF-IPCountry`) and the IP from `CF-Connecting-IP`, and passes both to the room as headers, since a Durable Object never sees `request.cf`. Client-sent copies are deleted first so they can't be spoofed. `ChatRoom.onConnect` stores them under `visitor_*` meta keys and upserts one `rooms` row per room into D1 (`migrations/0002_rooms.sql`), keeping `first_seen`. IPs are personal data: they stay in the room and that table, never in analytics.
- **Limits.** 40 messages per day per conversation (`ROOM_DAILY_LIMIT`), 1000 characters per message (`MAX_MESSAGE_LENGTH`). The `RateLimiter` Durable Object reads DeepSeek's `GET /user/balance` (cached 10 minutes, shared by every room, fails open) and stops chat below `BALANCE_RESERVE_USD`. A 402 from a chat call stops every room immediately. A top-up takes effect at the next cache expiry, with no deploy. At about $0.003 per turn, the account balance is the spending cap.
- **Local dev.** Put `DEEPSEEK_API_KEY=sk-...` in `.dev.vars` (gitignored), then use `bun run dev` or `bun run build && bun run preview` (http://localhost:4399). The widget connects on the same origin with full Durable Objects. Without the key the chat disables itself. Dev calls hit the real DeepSeek API and are billed. Don't put `OPPORTUNITY_INBOX` there: it would override the var, and the binding's `destination_address` lock rejects any other address.

## Credits

- Design language inspired by [Soumyajit4419's Portfolio](https://github.com/soumyajit4419/Portfolio). The hero desk illustration is adapted from it, recoloured to this site's navy theme.
- Originally based on [developerFolio](https://github.com/saadpasta/developerFolio).
