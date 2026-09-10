# murugappan.dev

Personal portfolio of Murugappan, built with [Astro 7](https://astro.build) (Vite 8 / Rolldown) and served by a single Cloudflare Worker.

**Live site:** https://murugappan.dev

One Astro project serves both the portfolio and the blog (served at `/blog`): blog routes live in `src/pages/blog/`, so the `/blog` prefix comes from file position rather than an Astro `base`, and the blog's non-route code (layout, islands, styles, post helpers) is namespaced under `src/blog/`. Posts are markdown in `content/blog/<slug>/index.md`. `npm run build:site` builds the whole site into a single `dist/`. The light/dark theme is shared across both halves via the `isDark` localStorage key.

## Development

```bash
npm install
npm run dev       # local dev server
npm run build     # production build into dist/
npm run preview   # preview the production build
```

The GitHub profile card is fetched at **build time** from the GitHub GraphQL API. Set a `GITHUB_TOKEN` environment variable locally (any token with public read scope) to render it; without one the site builds fine and shows a contact fallback instead.

```bash
GITHUB_TOKEN=ghp_xxx npm run build
```

[PostHog](https://posthog.com) analytics is wired at **build time** when both `POST_HOG_TOKEN` and `POST_HOG_URL` are set (configured in the Workers Builds build env vars for production). With either missing the SDK is never loaded, so local dev and CI builds stay analytics-free.

Ingestion goes through **`https://e.murugappan.dev`** — PostHog's _managed_ reverse proxy, a CNAME to their infrastructure (`…cf-prod-us-proxy.proxyhog.com`, US region). Nothing in this repo proxies it; the Worker is not in that request path, and the host is just the SDK's `api_host`. If the CNAME is ever re-added in Cloudflare DNS it must be **DNS only (grey cloud)** — proxying it breaks PostHog's cert issuance and SNI. `ui_host` stays `https://us.posthog.com` so the PostHog toolbar works.

**Session replay is Microsoft Clarity's job, not PostHog's** — the two tools split the work:

|                                                | tool                  |
| ---------------------------------------------- | --------------------- |
| Custom events, pageviews, autocapture, funnels | **PostHog**           |
| Session recordings, heatmaps                   | **Microsoft Clarity** |

PostHog is therefore initialised with `disable_session_recording: true`; recording in both would double the client cost and burn PostHog's quota on footage nobody watches. Clarity's recording UI is the better tool for watching a session back and is unmetered. Clarity is injected at build time when `PUBLIC_CLARITY_PROJECT_ID` is set, on idle so it stays off the initial load waterfall, and it is _only_ a tag — **there are no `clarity()` calls anywhere in the app**; `src/lib/analytics.ts` talks to PostHog exclusively.

Privacy: Clarity masks `<input>` contents in every masking mode and that is not configurable, so the Jarvis chat box and the blog search are covered automatically. A _sent_ chat message is re-rendered as a bubble `<div>` though, which masking modes do not cover, so the transcript container carries `data-clarity-mask="true"` — nothing a visitor typed reaches a recording, matching the no-PII rule the events follow.

### Custom events

`src/lib/analytics.ts` wraps PostHog for both apps — `track(event, props?)`, `tag(key, value)`, `initClickTracking()` and `bootAnalytics()`. `track` captures an event; `tag` registers a _super property_ (session context like `theme`, correct for anonymous visitors rather than person properties). Every one no-ops when the SDK was never loaded and swallows failures, so calls are safe anywhere; anything captured while the SDK is still loading is buffered and replayed. Pageviews, autocapture and heatmaps come from PostHog itself and are not re-instrumented here. **Nothing a visitor typed** (chat messages, blog search queries) is ever sent.

The SDK is the `posthog-js` npm package, `import()`ed on idle so it is a separate chunk outside the initial bundle. The token and host reach the client through `<meta name="ph-token">` / `<meta name="ph-host">` rendered from frontmatter — a meta tag rather than a `data-` attribute on the script because Astro bundles `<script>` as a module, where `document.currentScript` is `null`. This is also why the env vars need no `PUBLIC_` prefix: they are read at build time, never in a client bundle.

Plain links opt in declaratively — `data-ph-event`, plus optional `data-ph-prop`/`data-ph-value` — and one delegated `click` listener per document handles them, React-rendered markup included. `initClickTracking()` is called from `src/layouts/Layout.astro` (portfolio) and `src/blog/components/BaseHead.astro` (blog).

| Event                                            | Fired on                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `resume_download`                                | "Download my resume" (also upgrades the session recording)                                       |
| `contact_click`                                  | "Contact me"                                                                                     |
| `social_click`                                   | any outbound profile link, tagged `social=github\|linkedin\|email\|phone\|x\|rss\|stackoverflow` |
| `project_click`                                  | a pinned-repo card, tagged `project=<repo>`                                                      |
| `more_projects_click`                            | "More Projects"                                                                                  |
| `oss_link_click`                                 | an open-source card link, tagged `oss=<name>`                                                    |
| `blog_card_click`                                | a homepage blog card, tagged `post=<title>`                                                      |
| `chat_open`                                      | the Jarvis launcher is opened                                                                    |
| `chat_starter_click`                             | a suggested starter chip                                                                         |
| `chat_message_sent`                              | a message is sent (first one also upgrades the recording)                                        |
| `chat_limit` / `chat_error`                      | the room replies with a rate limit or an error                                                   |
| `chat_restart` / `chat_transcript_download`      | conversation menu actions                                                                        |
| `listen_play`                                    | first play on a post, tagged `post=<slug>`                                                       |
| `listen_resume` / `listen_pause` / `listen_seek` | transport controls (seek fires once per scrub)                                                   |
| `listen_rate`                                    | playback speed changed, tagged `listen_rate=<n>x`                                                |
| `listen_complete`                                | the post was read to the end                                                                     |
| `listen_audio_fallback`                          | pre-rendered audio failed and speech synthesis took over                                         |
| `listen_unavailable`                             | no backend at all (should be unreachable — the control hides itself)                             |

Super properties carry context rather than actions: `theme` (`dark`/`light`, set on load and on every toggle) and `listen_backend` (`audio`/`speech`).

## Checks

```bash
npm run check-format   # oxfmt (+ prettier for .astro/.md)
npm run lint           # oxlint
npm run check:astro    # type-check .astro files
npm run check:src      # type-check src/**/*.ts(x)
npm run check:worker   # type-check worker/
```

The project compiler is TypeScript 7, whose native build no longer ships the
old JS API that Astro's Volar-based tooling calls into — `astro check` crashes on it outright.
Microsoft publishes that old API as `@typescript/typescript6` for this overlap,
so `check:astro` preloads `scripts/ts-alias.cjs` to point Volar's
`require("typescript")` at the compat package while everything else stays on 7.
`@astrojs/check` also still declares a `typescript@^5 || ^6` peer, hence the
`overrides` entry in `package.json`. All three come out together once
`@astrojs/check` supports TypeScript 7.

Two consequences of having both compilers in the tree. `@typescript/typescript6`
pulls its own TypeScript 6, and that copy wins `node_modules/.bin/tsc` — so bare
`npx tsc` reports 6.0.3, and the `check:*` scripts invoke
`node node_modules/typescript/bin/tsc` by path to be sure they get 7. And
TypeScript 7 ships no `tsserver`, so an editor set to "use the workspace
TypeScript version" lands on the 6 copy; point it at the TypeScript 7 language
service instead.

## Deployment

Cloudflare Workers Builds (git-integrated) builds on every push to `main` with build command `npm run build:site` and deploy command `npm run deploy` — one Worker serves the static `dist/` and hosts the chat backend (see "AI chat widget" below). Both commands are Cloudflare dashboard settings, not read from this repo, so changing either means editing it by hand there — nothing in this file enforces them. `npm run deploy` applies any unapplied D1 migrations from `./migrations` before `wrangler deploy`; nothing in the Worker issues DDL against D1, so a deploy that skips this step leaves the chat mirror writing to a table that doesn't exist. GitHub Actions (`.github/workflows/ci.yml`) runs checks only — format, lint, type-check, worker and unit tests, and a build smoke test including resume generation.

Workers Builds settings, for reference (dashboard → Workers → this application):

- **Build command:** `npm run build:site`
- **Deploy command:** `npm run deploy` (not `npx wrangler deploy` — see above).
- **Build env vars:** `GITHUB_TOKEN` (public read scope), `REQUIRE_GITHUB_PROFILE=1`, `POST_HOG_TOKEN`, `POST_HOG_URL`, `PUBLIC_CLARITY_PROJECT_ID`, `RESUME_PHONE` (optional — see "Resume generation" below).
- **Worker secrets:** `OPPORTUNITY_INBOX` and `DEEPSEEK_API_KEY`, set with `npx wrangler secret put <name>`.

## Resume generation

`/resume` (`src/pages/resume.astro`) renders a print-styled resume sourced entirely from `src/data/portfolio.ts` and `src/data/resume.ts` — portfolio data is the single source of truth, so the page and the PDF can never drift from the site. As the last step of `npm run build:site`, `scripts/generate-resume.mjs` serves the finished `dist/` on a local port, opens `/resume/` in headless Chromium via Puppeteer, and prints it to `dist/resume.pdf`. Set `RESUME_PHONE` (Workers Builds build env for production, a local `.env` for previewing the phone line) to show a phone number on the resume — no phone number is hardcoded in source, so leaving it unset simply omits that line. The portfolio's own contact section (`GithubCard.astro`) only reads this value in its no-GitHub-profile fallback view; production renders the GitHub-profile branch instead, which never shows a phone number. After printing, the script parses `dist/resume.pdf` with `pdf-parse` and fails the build (exit 1, listing what's missing) unless every ATS-critical string (name, email, section headings, current title, and the standout stats) is present as extractable text — a guard against the PDF ever becoming an image-only, unparseable export. Puppeteer runs fine on Workers Builds — the image lacks some system libraries, so the script falls back to `@sparticuz/chromium` when no system Chrome is present (see its resolution chain). If headless Chromium ever stops being viable there, Tectonic/LaTeX is the documented fallback renderer for this same build step.

## Blog

The blog (["SDE Journey"](https://murugappan.dev/blog/), migrated from Gatsby) lives in the same Astro project:

    content/blog/          # one directory per post: <slug>/index.md (+ images)
      draft/               # drafts — visible in dev, excluded from production builds
    src/pages/blog/        # index, [...slug] post pages, 404, rss.xml, llms.txt, llms-full.txt
    src/blog/              # layout, head, React islands (search, tags, theme toggle, bio),
                           # styles, post helpers, consts.js site metadata
    src/content.config.ts  # blog content collection schema
    public/blog/           # static files served verbatim (og-image, sw.js)

### Writing a post

Create `content/blog/<slug>/index.md` with frontmatter:

```yaml
---
title: My post title
date: "2026-06-10T10:00:00.000Z"
tags: ["tag-one", "tag-two"]
description: One-line description shown in lists, search and feeds.
---
```

Images placed next to `index.md` can be referenced relatively (`![alt](image.png)`) and are optimized at build
time. ` ```mermaid ` code blocks are rendered to diagrams client-side. The directory name is the URL slug, so
the post is published at `/blog/<slug>/` and picked up automatically by the sitemap, RSS feed, both `llms.txt`
files and the markdown renditions.

### Read-aloud audio

Every post has a **Listen** control. When `/blog/audio/<slug>.json` exists the page plays a
pre-rendered MP3 of the post in the blog's designed narrator voice and highlights the paragraph
being read from the timing JSON; otherwise (a new post, or `astro dev`, which has no Worker) it
falls back to the browser's speech synthesis. Audio is generated **on a laptop, never in CI**: the
model is 3.9 GB and needs Apple Silicon.

**Pipeline** (`scripts/generate-audio.mjs`): built HTML → the same `speechBlocks()` the page
uses → emoji/punctuation/long-digit-run normalisation → ≤300-char sentence groups → Breeze TTS 2
(`scripts/tts/synth.py`, [mlx-community/Breeze-TTS-2-mlx-8bit](https://huggingface.co/mlx-community/Breeze-TTS-2-mlx-8bit)
via [mlx-audio](https://github.com/Blaizzy/mlx-audio), plain clone of `.voice/reference.wav`) →
`atempo=1.08` per chunk → sample-accurate joins (0.15 s within a paragraph, 0.45 s between) →
`loudnorm I=-16` → 64 kbps MP3 + `{blocks:[{text,start,end}]}` JSON → R2 bucket
`murugappan-dev-audio` (`infra/main.tf`, bound as `AUDIO`) under the per-voice prefix
`blog/breeze/`, served by `worker/audio.ts` with Range/ETag support. Posts whose spoken-text hash
is unchanged are skipped. The previous voice (a Fish Audio S2 Pro clone of a phone recording,
2026-09-05) is still in the bucket at `blog/<slug>.*` and is no longer referenced.

**One-time setup**

```bash
brew install ffmpeg
python3.13 -m venv .venv-tts && .venv-tts/bin/pip install -r scripts/tts/requirements.txt
.venv-tts/bin/python scripts/tts/design-voice.py 3   # persona prompt → .voice/candidates/{0,1,2}.wav
cp .voice/candidates/<k>.wav .voice/reference.wav && cp .voice/candidates/reference.txt .voice/reference.txt
npm run audio -- --upload-voice     # durable copy in R2; restored automatically if .voice/ is lost
```

Or skip the design step and fetch the clip in use: `npm run audio` restores `.voice/` from
`voice/breeze/` in R2 when it is missing.

The bucket comes from `terraform apply` in `infra/` (or `npx wrangler r2 bucket create
murugappan-dev-audio`). Voice reference and venv are git-ignored; the reference is never served.

**Publishing a post**

```bash
npm run build && npm run audio <slug>      # ~2.8 s of compute per second of audio on an M4 Pro
npm run audio:align <slug>                # word timings for the Speechify-style highlight, ~5 s per post
```

Then push as usual. `npm run audio` with no slug renders every changed post; `--force` re-renders,
`--dry-run` only extracts and hashes, `--local` targets `wrangler dev`'s R2. `npm run audio:align`
(`scripts/align-audio.mjs`) runs after synthesis, never concurrently: it slices each paragraph out of the
MP3 in R2, gets word timestamps from [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper)
(`whisper-large-v3-turbo`, 1.6 GB, auto-downloaded), maps them onto the known text
(`src/blog/utils/audio-words.ts`) and rewrites the JSON as version 2 with a `words` array per
paragraph. The page highlights the current word when that array exists and the paragraph otherwise;
the speech-synthesis fallback gets word highlights from the browser's `boundary` events. Breeze TTS 2
weights are under the BreezeBlue Research and Non-Commercial License, which this personal blog satisfies.

**The voice** was chosen in a 2026-09-09 listening evaluation against Google Chirp 3 HD, Gemini 3.1
Flash TTS and the earlier Fish clone. The clone of a phone recording hissed and shifted tone between
paragraphs; a _designed_ voice fixes both because the reference clip is synthetic (noise floor about
−60 dBFS) and every paragraph clones the same clip. The design runs once with the persona prompt in
`scripts/tts/design-voice.py` (`cfg_scale=4`):

> A 25-year-old male software engineer from Chennai with a light Tamil-influenced Indian English
> accent, recording the audio version of his own blog post. Quiet confidence and a bit of dry
> humour. Natural conversational pace, slight emphasis on key terms, brief pauses between ideas.

Per-paragraph synthesis passes **no** instruction: classifier-free guidance would run the 3B backbone
twice per frame and let the delivery drift. Use the 8-bit build; bf16 swaps on a 24 GB machine and is
3x slower. Breeze loops on long runs of one digit (`0.30000000000000004`), which is why
`normalizeSpeechText` describes such runs instead of listing them. Gemini 3.1 Flash TTS (voice
`Fenrir`) sounded as good and renders in seconds, but has no free tier once billing is attached to the
project; its narration prompt was "Narrate this technical blog post like a calm, clear software
engineer explaining to a peer. Natural conversational pace, no hype. Read acronyms letter by letter
and code identifiers exactly as written."

## Public API (`/api/*`)

A public, unauthenticated JSON API over the site's own content, for AI agents and
developers. Documented for humans at [`/developers`](https://murugappan.dev/developers/),
for machines at [`/openapi.json`](https://murugappan.dev/openapi.json) (OpenAPI 3.1.0),
and for agents at [`/AGENTS.md`](https://murugappan.dev/AGENTS.md).

- **Code:** `worker/api/` — `routes.ts` is the single source of truth for the
  surface (the router and the spec are both checked against it), `openapi.ts`
  generates the spec, `errors.ts` is the one JSON error envelope, `store.ts`
  reads the inputs, `index.ts` is the Hono sub-app.
- **Endpoints:** `GET /api/v1/profile`, `/api/v1/experience`, `/api/v1/skills`,
  `/api/v1/education`, `/api/v1/open-source`, `/api/v1/posts` (`?q=`, `?limit=`),
  `/api/v1/posts/{slug}` (full markdown), `POST /api/v1/contact`,
  `GET /api/v1/versions`, and the spec at `/openapi.json` + `/api/v1/openapi.json`.
- **Versioning** (`worker/api/versioning.ts`): the version is a path segment.
  `API_PATHS` holds the published `/api/v1/...` templates; `toVersionedPath()`
  normalises the unversioned `/api/...` alias onto them, which is what lets
  `server.ts` mount the same Hono app at both prefixes (versioned first, so
  `/api/v1/profile` matches its own route rather than the catch-all). The alias
  is a permanent pin to v1 — a v2 would live only at `/api/v2/...`. `VERSIONS`
  is the catalogue: adding a record there is what turns on `Deprecation`
  (RFC 9745) and `Sunset` (RFC 8594) headers, the `deprecation` /
  `successor-version` `Link` relations, and the `GET /api/v1/versions` document.
  Every API response carries `API-Version`, `API-Supported-Versions` and the
  discovery `Link` relations, applied by `worker/api/middleware.ts` so no
  endpoint can be added without them.
- **Rate-limit headers** (`worker/api/ratelimit.ts`): every response carries
  `RateLimit-Policy` and `RateLimit` in the syntax of
  draft-ietf-httpapi-ratelimit-headers, mirrored as `X-RateLimit-Limit` /
  `-Remaining` / `-Reset`, with `Retry-After` on a `429`. Reads have a fair-use
  ceiling (600 per 60s per client) counted in a per-isolate fixed window — no
  Durable Object round trip on a read, and the consequence (the ceiling is per
  edge location, so the advertised number is a floor) is documented on
  `/developers`. Contact responses report the real daily allowance, which
  `RateLimiter.takeContactSlot()` / `contactUsage()` now return.
- **No second copy of the data.** `src/pages/api/dataset.json.ts` is an Astro
  static endpoint that runs `src/data/portfolio.ts` + `resume.ts` through
  `buildDataset()` (in `worker/api/dataset.ts`) and prerenders
  `dist/api/dataset.json`; the Worker reads it back through the ASSETS binding.
  Blog posts come from the merged root `llms.txt` and the per-post `index.md`
  renditions, so the API can't fall behind the blog. `/developers` renders its
  endpoint table from the same OpenAPI document the Worker serves.
- **Worker-owned paths.** `run_worker_first` in `wrangler.jsonc` claims `/api/*`,
  `/openapi.json`, `/mcp*`, `/mcp.json` and `/.well-known/*` so every API failure
  is the JSON error envelope rather than the HTML 404 page, and so the generated
  discovery documents name the host that answered — keep that list in sync with
  `worker/server.ts`.
- **`POST /api/v1/contact`** emails `OPPORTUNITY_INBOX` (same secret and
  `send_email` binding the chat's lead capture uses). Rate-limited by the
  existing `RateLimiter` DO: 3/client-IP/UTC-day, 20 site-wide. `"dryRun": true`
  validates a payload without sending or spending a slot — the endpoint's
  sandbox. Without the secret configured it answers `503`, never a silent drop.

## Discovery documents and the agent-readable 404

Three things exist so an agent that has never seen this site can find its way in
without reading prose, and can recover when it guesses a URL wrong.

- **`/.well-known/api-catalog`** (`worker/well-known.ts`) — an RFC 9727 API
  catalogue, serialised as an RFC 9264 link set
  (`application/linkset+json`). One context object per API: the REST API
  (anchored at `/api/v1`, with `service-desc` → `/openapi.json`, `service-doc` →
  `/developers/`, `service-meta` → `/api/v1/versions`) and the MCP server. Also
  advertised as `Link: rel="api-catalog"` on the pages and in `<link>` in the
  layout head.
- **`/.well-known/mcp.json`** and **`/mcp.json`** — the MCP `server.json`
  manifest, following the published schema: reverse-DNS `name`
  (`dev.murugappan/murugappan-dev`), a `description` inside the schema's
  100-character cap, and one `streamable-http` remote. Anything beyond the
  schema rides in `_meta` under a reverse-DNS key. Generated, so the remote URL
  names the host that answered.
- **The 404** (`worker/not-found.ts`) — every miss reaches the Worker (see
  `run_worker_first` above) and is content-negotiated: `Accept: text/html` gets
  the styled `404.html` the assets layer produced, unchanged; anything else
  (including no `Accept` at all, which is what curl and `fetch` send) gets a
  short markdown body naming the sitemap, `llms.txt`, `AGENTS.md`,
  `/developers/`, the OpenAPI document, the API catalogue, the MCP manifest and
  the pages that do exist. Both branches carry `Vary: Accept` and the discovery
  `Link` relations, and the status is a real `404` either way.

`public/_redirects` also 301s the URLs people and agents guess before they guess
`/developers/`: `/docs`, `/api-docs`, `/developer`, `/api-reference`,
`/mcp-server`.

## MCP server (`/mcp`)

The same content again as a [Model Context Protocol](https://modelcontextprotocol.io)
server, so an MCP client can use the site without any HTTP glue. Add it as
`https://murugappan.dev/mcp` — Streamable HTTP, `POST` only, no auth, no session.

- **Code:** `worker/mcp/` — `protocol.ts` (JSON-RPC framing, version constants,
  header/body validation, Origin check), `tools.ts` (the eight tools, each a thin
  adapter over `worker/api/store.ts`), `schema.ts` (inlines the OpenAPI
  `$ref`s so every tool's `outputSchema` is self-contained, as the spec
  requires), `index.ts` (the Hono app).
- **Dual-era.** Implements revision `2026-07-28` (stateless, per-request
  `_meta`, `resultType`, mandatory `server/discover`, mirrored
  `MCP-Protocol-Version` / `Mcp-Method` / `Mcp-Name` headers validated against
  the body with `-32020` on mismatch) _and_ the `initialize` handshake of
  `2025-11-25` / `2025-06-18` / `2025-03-26`, which is what most deployed
  clients still speak. The era is chosen by whether the request carries modern
  `_meta`. No session is ever minted; `GET`/`DELETE` answer `405`.
- **Tools:** `get_profile`, `list_experience`, `list_skills`, `list_education`,
  `list_open_source`, `search_blog_posts`, `get_blog_post`, `send_message`.
  `send_message` shares the `RateLimiter` allowance with `POST /api/v1/contact`
  and honours the same `dryRun`.
- **Resources** (`worker/mcp/resources.ts`): `/llms.txt`, `/AGENTS.md`, the
  generated `openapi.json`, `/blog/llms-full.txt`, and one entry per published
  post, plus the `{slug}` URI template. `https://` URIs, per the spec's rule
  that the scheme is for resources a client can fetch from the web itself.
  Reads go through an explicit allowlist and a re-validated slug, and a missing
  resource is `-32602` with the uri in `data` — never an empty `contents` array.
- **Docs are generated.** The MCP section of `/developers` renders its tool
  table from `MCP_TOOLS`, so it cannot list a tool that does not exist.

## Credits

- Design language inspired by [Soumyajit4419's Portfolio](https://github.com/soumyajit4419/Portfolio); the hero desk illustration is adapted from that project (recolored to this site's navy theme).
- Originally based on [developerFolio](https://github.com/saadpasta/developerFolio) before the Astro migration.

## AI chat widget

Intercom-style AI concierge (named Jarvis) on every page (portfolio + blog).

- **Server:** `worker/` — Cloudflare Worker serving `dist/` as static assets +
  `ChatRoom` Durable Object (partyserver, SQLite) streaming replies over
  WebSocket at `/parties/chat-room/:roomId`.
- **Model:** DeepSeek `deepseek-flash` (BYOK via the `DEEPSEEK_API_KEY`
  secret), the only provider — Workers AI was dropped on 2026-08-27 for being
  slow and truncating replies when the free neuron allocation ran out. Thinking
  is enabled (`thinking: {type: "enabled"}`) — the model reasons before
  answering, which sharpens tool selection; `reasoning_content` is dropped so
  visitors see only the reply. This is only safe because there is no
  `max_tokens`: reasoning used to consume the whole 800-token cap. `deepseek-flash`
  tracks the current Flash generation — it became V4.1-Flash on 2026-09-10, when
  the older `deepseek-v4-flash` name was retired to a temporary compat alias.
- **Swapping the model:** run `npm run test:capture` first. It drives a real
  lead-capture conversation against the live model and fails if
  `capture_opportunity` is never called, or is called without the visitor's
  contact detail. qwen3-30b was reverted on 2026-08-17 for narrating captures
  it never made — unit tests cannot catch that, only the live model can. Needs
  `.dev.vars` and a built `dist/llms.txt`; costs a fraction of a cent.
- **Widget:** `src/components/chat/` (shared by the blog via relative import).
  While a turn is in flight the panel shows `ActivityRow` instead of the three
  dots: a rotating playful label ("Discombobulating…") with an elapsed counter
  while the model reasons, switching to the real action when the worker
  broadcasts a `tool` frame ("Reading blog/…", "Noting your details"). The
  frame carries only the tool name plus a page path — never tool arguments —
  and is ephemeral: nothing is persisted, and the next delta clears the row.
  The row is `aria-hidden` with a stable `sr-only` "Jarvis is typing", so the
  rotating words don't spam the panel's live region.
- **Email:** `send_email` binding → `OPPORTUNITY_INBOX` (Worker secret).
- **Limits:** 20 msgs/day per conversation, 300/day globally, 1000 chars/msg.
  Chat runs until the DeepSeek account is actually out of credit — the
  `RateLimiter` DO reads `GET /user/balance` on the same key (cached 10 min,
  shared by every room, fails open) and gates below `BALANCE_RESERVE_USD`.
  A 402 from a chat call is authoritative and gates every room at once; a
  top-up is picked up at the next cache expiry, no deploy. There is no daily
  allowance — at ~$0.003/turn, top up to set the ceiling.
- **Local dev (full-fidelity single-origin):** `npm run build:site && npx wrangler dev` → http://localhost:8787
  (runs both Astro and Worker on the same origin; chat connects at the Worker origin with full Durable Objects).
  Put `OPPORTUNITY_INBOX=you@example.com` and `DEEPSEEK_API_KEY=sk-...` in `.dev.vars` (gitignored);
  without the key the chat gates itself, since there is no fallback provider.
- **Local dev (fast HMR loop):** put `PUBLIC_CHAT_HOST=localhost:8787` in a root `.env` (gitignored), then run `npm run dev:all`.
  Starts Astro dev server (with HMR) on :4399 and Worker on :8787 in parallel; the widget connects to the real Worker.
  Note: the Worker serves grounding from `dist/`, so run `npm run build:site` at least once first, or Jarvis will lack site knowledge.
  Also note: AI calls in dev hit the real DeepSeek API and are billed, so watch your spend.
- **Tests:** `npm test` (vitest + workers pool), `npm run check:worker`.
