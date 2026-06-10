# Monorepo (portfolio + blog) on Cloudflare Pages

**Date:** 2026-06-10
**Status:** Approved by user ("LGTM")

## Goal

Serve murugappan.dev (portfolio) and murugappan.dev/blog (blog) from a single
Cloudflare Pages project, built from this one repo, replacing GitHub Pages.
Wins: true HTTP 301 redirects for the old blog-post URLs, Cloudflare edge
caching/HTTP3 (TTFB), immutable-asset and security headers, one repo + one
workflow + one deploy. URLs do not change, so Search Console / sitemaps /
rankings carry over with no action.

## Decisions (user-confirmed)

| Decision | Choice |
|---|---|
| Scope | Everything to Cloudflare; GitHub Pages retired after verification |
| Topology | ONE Pages project (`murugappan-dev`), direct upload via wrangler from GitHub Actions (no CF git integration, no Workers) |
| Blog location | Moves INTO this repo as `blog/` — two Astro apps, one repo. Blog app copied as-is from `~/personal/blog` (branch `migrate-astro`): own `astro.config.mjs` (`base: "/blog"`, site murugappan.dev), own package.json. No app-merge refactor (possible later follow-up). |
| Blog history | Plain copy; old `murugu-21/blog` repo keeps history and is archived after cutover |
| CF-side config | User clicks dashboard (token creation, Pages project, custom domain, www rule); agent scripts everything in-repo and verifies |
| Lockfiles | Blog converted yarn.lock → package-lock.json so both apps use `npm ci` |

## Repo layout

```
/            portfolio Astro app (root, unchanged)
blog/        blog Astro app (copied; excludes dist/, node_modules/, .git/, docs/)
```

## Build

Root `package.json` gains:
- `build:blog` = `npm --prefix blog run build`
- `build:site` = portfolio `astro build` + `build:blog` + `cp -R blog/dist/. dist/blog/`

Astro `base: "/blog"` affects URL generation only; blog files land at `blog/dist/`
root and are merged under `dist/blog/`. Local dev unchanged per app.

## Deploy workflow (`.github/workflows/deploy.yml`)

Triggers: push to main, workflow_dispatch, weekly cron (Mon 12:00 UTC).
Steps: checkout → Node 20 + npm cache → `npm ci` (root) → `npm ci --prefix blog`
→ `npm run check-format` → `npx astro check` (root) → blog check (its `test`
script runs astro check) → `npm run build:site` (env: GITHUB_TOKEN for the
profile card; REQUIRE_GITHUB_PROFILE=1 on schedule events only) →
`cloudflare/wrangler-action` `pages deploy dist --project-name murugappan-dev`
→ (transition only) ALSO publish `dist` to gh-pages as today.

Secrets (this repo only): `CLOUDFLARE_API_TOKEN` (Pages:Edit), `CLOUDFLARE_ACCOUNT_ID`.

## Redirects, headers, robots

- `public/_redirects` (new): 7 true 301s — `/429-googleapis/ /blog/429-googleapis/ 301`
  and likewise for cloud-agnostic-rate-limiting, coin-change-problem, first-post,
  gastby, react, toolbox. Cloudflare Pages evaluates these before static files.
- `public/_headers` (new): `/static/*` and `/blog/static/*` →
  `Cache-Control: public, max-age=31536000, immutable`; site-wide
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: DENY`.
- `public/robots.txt`: blog sitemap pointer updated from the Gatsby path
  (`/blog/sitemap/sitemap-index.xml`) to the Astro blog's `/blog/sitemap-index.xml`.
- The 7 meta-refresh stub directories in `public/` REMAIN until GitHub Pages is
  retired (the `_redirects` file is inert on GH Pages; stubs are inert on CF
  because `_redirects` wins). Deleted in the final cleanup step.
- `public/CNAME` remains until gh-pages dual-publish is removed, then deleted.

## Theme continuity

Portfolio persists dark mode under localStorage key `isDark` (JSON bool) with a
pre-paint script. Check the blog app's persistence key/mechanism; align the two
(one-line change on whichever side differs) so the theme survives navigating
between `/` and `/blog`.

## Cutover sequence

1. User: create CF API token (Account → Cloudflare Pages: Edit), note Account ID;
   add both as repo secrets. Create Pages project `murugappan-dev`
   (Workers & Pages → Create → Pages → Direct Upload — name only; first real
   upload comes from CI).
2. Agent: land the monorepo + workflow changes on a branch; verify CI deploy to
   `murugappan-dev.pages.dev`; full preview verification (below); merge to main.
3. User: Pages project → Custom domains → add `murugappan.dev` (Cloudflare
   swaps the zone's GitHub A records for a proxied CNAME automatically); add
   Redirect Rule `www.murugappan.dev/*` → `https://murugappan.dev/$1` (301).
4. Agent: live verification (below). Then remove gh-pages dual-publish step,
   delete stubs + CNAME. User disables GitHub Pages on this repo and archives
   `murugu-21/blog`.

Rollback at any point before step 4 completes: restore the four `185.199.108-111.153`
A records (DNS only) — GitHub Pages is still publishing.

## Verification gates

Preview (`murugappan-dev.pages.dev`), before domain attach:
- Portfolio renders (incl. GitHub card from CI token build), blog home + a post
  render with styles/fonts, theme toggle works on both and persists across apps
- `curl -I` on an old post URL returns 301 → /blog/...
- `_headers` visible: immutable cache-control on hashed assets
- /sitemap.xml, /robots.txt, /llms.txt, /og-image.png, /resume.pdf,
  /blog/sitemap-index.xml, /blog/rss.xml, /blog/llms.txt all 200

Live (murugappan.dev), after domain attach:
- Same checks against the domain + true-301 proof, TTFB compare vs GitHub Pages
  baseline (recorded before cutover), Lighthouse ≥ current (100/100/100), blog
  deep links, www → apex 301

## Amendment (2026-06-10, user decision): CF git integration instead of wrangler upload

- The Pages project is **git-connected**, not direct-upload: Cloudflare's CI builds on
  every push (production = `main`, previews = other branches/PRs automatically).
  Dashboard build config: build command `npm ci --prefix blog && npm run build:site`,
  output directory `dist`, root directory `/`. Node version pinned via root `.nvmrc` (20).
- CF build environment variables (user sets in dashboard): `GITHUB_TOKEN` = a no-scope
  fine-grained/classic PAT (public-profile GraphQL read only), and
  `REQUIRE_GITHUB_PROFILE=1` (any CF build that can't fetch the profile fails, keeping
  the last good deploy live — CF builds can't distinguish cron from push, and failing
  loudly is preferred).
- GitHub Actions: `deploy.yml` becomes `ci.yml` — checks (format, astro check ×2) +
  build smoke + gh-pages dual-publish on main (transition only) + a weekly cron job
  that POSTs to a CF **deploy hook** URL (GitHub secret `CF_DEPLOY_HOOK_URL`) to
  refresh the build-time GitHub data.
- No `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` secrets needed anywhere.
- User-gate steps change accordingly: connect repo in dashboard, set build config +
  env vars, create deploy hook; previews come from CF automatically per branch.
