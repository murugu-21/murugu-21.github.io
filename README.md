# murugappan.dev

Personal portfolio of Murugappan, built with [Astro 5](https://astro.build) and deployed to Cloudflare Pages.

**Live site:** https://murugappan.dev

This is a monorepo: the portfolio lives at the root and the blog (served at `/blog`) lives in `blog/`. `npm run build:site` builds both into a single `dist/`. The light/dark theme is shared between the two apps via the `isDark` localStorage key.

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

Microsoft Clarity analytics is injected at **build time** when a `PUBLIC_CLARITY_PROJECT_ID` environment variable is set (configured in the Cloudflare Pages build env vars for production). Without it the tag is omitted entirely, so local dev and CI builds stay analytics-free.

## Checks

```bash
npm run check-format   # prettier
npx astro check        # type-check .astro files
```

## Deployment

Cloudflare Workers Builds (git-integrated) builds on every push to `main` with build command `npm ci --prefix blog && npm run build:site` and deploy command `npx wrangler deploy` — one Worker serves the static `dist/` and hosts the chat backend (see "AI chat widget" below). GitHub Actions (`.github/workflows/ci.yml`) runs checks only — format, type-check, worker tests, blog tests, and a build smoke test including resume generation.

## Resume generation

`/resume` (`src/pages/resume.astro`) renders a print-styled resume sourced entirely from `src/data/portfolio.ts` and `src/data/resume.ts` — portfolio data is the single source of truth, so the page and the PDF can never drift from the site. As the last step of `npm run build:site`, `scripts/generate-resume.mjs` serves the finished `dist/` on a local port, opens `/resume/` in headless Chromium via Puppeteer, and prints it to `dist/resume.pdf`. Set `RESUME_PHONE` (Cloudflare Pages build env for production, a local `.env` for previewing the phone line) to show a phone number on the resume — no phone number is hardcoded in source, so leaving it unset simply omits that line. The portfolio's own contact section (`GithubCard.astro`) only reads this value in its no-GitHub-profile fallback view; production renders the GitHub-profile branch instead, which never shows a phone number. After printing, the script parses `dist/resume.pdf` with `pdf-parse` and fails the build (exit 1, listing what's missing) unless every ATS-critical string (name, email, section headings, current title, and the standout stats) is present as extractable text — a guard against the PDF ever becoming an image-only, unparseable export. Workers Builds' Chromium/Puppeteer compatibility should be re-verified when the AI chat widget cutover (see below) moves builds off Cloudflare Pages; if headless Chromium isn't viable there, Tectonic/LaTeX is the documented fallback renderer for this same build step.

## Public API (`/api/*`)

A public, unauthenticated JSON API over the site's own content, for AI agents and
developers. Documented for humans at [`/developers`](https://murugappan.dev/developers/),
for machines at [`/openapi.json`](https://murugappan.dev/openapi.json) (OpenAPI 3.1.0),
and for agents at [`/AGENTS.md`](https://murugappan.dev/AGENTS.md).

- **Code:** `worker/api/` — `routes.ts` is the single source of truth for the
  surface (the router and the spec are both checked against it), `openapi.ts`
  generates the spec, `errors.ts` is the one JSON error envelope, `store.ts`
  reads the inputs, `index.ts` is the Hono sub-app.
- **Endpoints:** `GET /api/profile`, `/api/experience`, `/api/skills`,
  `/api/education`, `/api/open-source`, `/api/posts` (`?q=`, `?limit=`),
  `/api/posts/{slug}` (full markdown), `POST /api/contact`, and the spec at
  `/openapi.json` + `/api/openapi.json`.
- **No second copy of the data.** `src/pages/api/dataset.json.ts` is an Astro
  static endpoint that runs `src/data/portfolio.ts` + `resume.ts` through
  `buildDataset()` (in `worker/api/dataset.ts`) and prerenders
  `dist/api/dataset.json`; the Worker reads it back through the ASSETS binding.
  Blog posts come from the merged root `llms.txt` and the per-post `index.md`
  renditions, so the API can't fall behind the blog. `/developers` renders its
  endpoint table from the same OpenAPI document the Worker serves.
- **Worker-owned paths.** `run_worker_first` in `wrangler.jsonc` claims `/api/*`
  and `/openapi.json` so every API failure is the JSON error envelope rather
  than the HTML 404 page — keep that list in sync with `worker/server.ts`.
- **`POST /api/contact`** emails `OPPORTUNITY_INBOX` (same secret and
  `send_email` binding the chat's lead capture uses). Rate-limited by the
  existing `RateLimiter` DO: 3/client-IP/UTC-day, 20 site-wide. `"dryRun": true`
  validates a payload without sending or spending a slot — the endpoint's
  sandbox. Without the secret configured it answers `503`, never a silent drop.

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
  `send_message` shares the `RateLimiter` allowance with `POST /api/contact` and
  honours the same `dryRun`.
- **Resources** (`worker/mcp/resources.ts`): `/llms.txt`, `/AGENTS.md`, the
  generated `openapi.json`, `/blog/llms-full.txt`, and one entry per published
  post, plus the `{slug}` URI template. `https://` URIs, per the spec's rule
  that the scheme is for resources a client can fetch from the web itself.
  Reads go through an explicit allowlist and a re-validated slug, and a missing
  resource is `-32602` with the uri in `data` — never an empty `contents` array.
- **Docs are generated.** The MCP section of `/developers` renders its tool
  table from `MCP_TOOLS`, so it cannot list a tool that does not exist.

## Credits

- Design language inspired by [Soumyajit4419's Portfolio](https://github.com/soumyajit4419/Portfolio); the hero desk illustration is adapted from that project (recolored to this site's green theme).
- Originally based on [developerFolio](https://github.com/saadpasta/developerFolio) before the Astro migration.

## AI chat widget

Intercom-style AI concierge (named Jarvis) on every page (portfolio + blog).

- **Server:** `worker/` — Cloudflare Worker serving `dist/` as static assets +
  `ChatRoom` Durable Object (partyserver, SQLite) streaming
  `@cf/openai/gpt-oss-120b` (Workers AI) over WebSocket at
  `/parties/chat-room/:roomId`.
- **Widget:** `src/components/chat/` (shared by the blog via relative import).
- **Email:** `send_email` binding → `OPPORTUNITY_INBOX` (Worker secret).
- **Limits:** 20 msgs/day per conversation, 300/day globally, 1000 chars/msg.
- **Local dev (full-fidelity single-origin):** `npm run build:site && npx wrangler dev` → http://localhost:8787
  (runs both Astro and Worker on the same origin; chat connects at the Worker origin with full Durable Objects + Workers AI).
  Put `OPPORTUNITY_INBOX=you@example.com` in `.dev.vars` (gitignored).
- **Local dev (fast HMR loop):** put `PUBLIC_CHAT_HOST=localhost:8787` in a root `.env` (gitignored), then run `npm run dev:all`.
  Starts Astro dev server (with HMR) on :4321 and Worker on :8787 in parallel; the widget connects to the real Worker.
  Note: the Worker serves grounding from `dist/`, so run `npm run build:site` at least once first, or Jarvis will lack site knowledge.
  Also note: AI calls in dev hit the real (authenticated) Workers AI, so watch your quota.
- **Tests:** `npm test` (vitest + workers pool), `npm run check:worker`.

### One-time cutover (Pages → Worker), in order

1. **Email routing:** `cd infra && terraform init && terraform apply`
   (needs `CLOUDFLARE_API_TOKEN` env + `terraform.tfvars`, see
   `terraform.tfvars.example`). Then click the verification link Cloudflare
   sends to the inbox.
2. **Worker secret:** `npx wrangler secret put OPPORTUNITY_INBOX`.
3. **Workers Builds:** Cloudflare dashboard → Workers → create application →
   connect this repo. Build command:
   `npm ci --prefix blog && npm run build:site`. Deploy command:
   `npx wrangler deploy`. Env vars (build): `GITHUB_TOKEN`,
   `REQUIRE_GITHUB_PROFILE=1`, `PUBLIC_CLARITY_PROJECT_ID`, `RESUME_PHONE`
   (optional — see "Resume generation" above).
4. **Smoke test** on the `workers.dev` URL: pages render, `_redirects` 301s
   work, chat answers, opportunity email arrives.
5. **Access-gate previews:** add a Cloudflare Access policy for the
   `workers.dev` preview URLs (mirrors the old `*.pages.dev` gating).
6. **Domain move:** Pages project → remove custom domain `murugappan.dev`;
   Worker → Settings → Domains & Routes → add custom domain `murugappan.dev`.
7. **Decommission:** after production traffic is verified on the Worker,
   delete the Pages project `murugu-21-github-io`.
