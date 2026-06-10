# Astro SSG migration of murugappan.dev (portfolio)

**Date:** 2026-06-10
**Status:** Approved by user ("LGTM")

## Goal

Replace the CRA (React 16 + react-scripts 5) developerFolio portfolio with an Astro v5
static site so the page is fully server-rendered HTML, improving SEO crawlability and
Lighthouse scores (performance, SEO, best-practices). Pixel-faithful to the current
design: same sections, same green theme, same dark/light behavior, same content.

## Decisions (user-confirmed)

| Decision | Choice |
|---|---|
| Framework | Astro v5, `output: 'static'`, `site: 'https://murugappan.dev'` |
| Fidelity | Pixel-faithful port of current look (SCSS, layout, lotties, section order) |
| Splash screen | **Dropped** — page renders immediately (main Lighthouse win) |
| Analytics | GA4 `G-EGG005JECM` (same tag as the blog), loaded deferred |
| Repo | Same repo (`murugu-21/murugu-21.github.io`), branch `astro-migration`, merge to `main` after verification |
| Blog repo | Untouched — portfolio only |

## Architecture

```
src/pages/index.astro          single page composing all sections
src/components/*.astro         Header, Greeting, Skills, Proficiency, Education,
                               WorkExperience, OpenSource, Blogs, GithubCard, Footer
src/data/portfolio.ts          content data, same shape as current portfolio.js
src/styles/                    ported SCSS (_globalColor.scss + per-component styles)
public/                        verbatim: CNAME, 7 redirect stubs, og-image.png,
                               robots.txt, sitemap.xml, llms.txt, favicons
```

CRA source (`src/` React components, `fetch.js`, react-scripts config) is removed in the
same branch.

## Static rendering (zero client JS)

- All content sections render to HTML at build time.
- **GitHub profile card:** GitHub GraphQL query moves from client fetch (`profile.json`)
  to Astro build-time fetch using the Actions `GITHUB_TOKEN`. Avatar/bio/location are
  static HTML. Weekly cron redeploy (already in the workflow) keeps the data fresh.
  Fallback: if the token/fetch fails at build, render the plain contact block instead
  (mirrors current `Profile.js` fallback) — the build must not break.
- **Experience-card banner colors:** replace runtime `color-thief` sampling with a
  build-time dominant-color computation per company logo, inlined as a style.
- **Hamburger menu:** stays CSS-checkbox-only (as today).
- **Emoji:** native unicode instead of `react-easy-emoji`/twemoji CDN images.
  Known minor visual difference in emoji glyph style.

## Client JavaScript (islands only)

1. **Theme toggle:** inline `<head>` script applies the persisted theme class before
   first paint (no FOUC); a small vanilla toggle script handles switching + localStorage.
   Behavior parity with current `window.__theme` mechanism.
2. **Lottie animations** (hero `landingPerson`, skills `codingPerson` — the recolored
   green JSONs): lazy-loaded `lottie-web` initialized via `IntersectionObserver`
   when scrolled into view. No load-blocking.
3. **Entrance animations:** react-reveal fades replaced by equivalent CSS animations
   (`@media (prefers-reduced-motion)` respected).

Removed from the shipped bundle entirely: react, react-dom, react-scripts, react-reveal,
react-headroom, react-easy-emoji, react-toggle, colorthief, lottie React wrapper.

## SEO head & assets

- Carry over verbatim: canonical (`https://murugappan.dev/`), meta description,
  OG/Twitter tags + `og-image.png`, JSON-LD `Person`, robots.txt (with both sitemap
  pointers), sitemap.xml, llms.txt, CNAME, redirect stubs.
- Fonts (Agustina, Montserrat) self-hosted through Astro's asset pipeline with
  `font-display: swap` and build-managed preload hashes (eliminates the stale-hash
  preload 404 bug class).
- GA4 via deferred script.

## Build & deploy

- `.github/workflows/deploy.yml`: Node 20, `npm ci`, `npm run build` (= `astro build`
  → `dist/`), deploy `dist/` with the existing `JamesIves/github-pages-deploy-action`
  to `gh-pages`. Keep `workflow_dispatch`, weekly cron, `permissions: contents: write`.
- Astro copies `public/` into `dist/` verbatim (CNAME + redirects preserved on every
  deploy).

## Verification before merge (gate)

1. Local `astro build` + `astro preview` succeeds.
2. Side-by-side screenshots vs live site — light **and** dark mode, every section
   (header, hero, skills, proficiency, education, experience, open source, blogs,
   GitHub card, footer).
3. Lighthouse audit on old (live) vs new (preview) — record the delta; new must not
   regress any category and should materially improve performance.
4. Confirm serving of: `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/og-image.png`,
   redirect stubs (`/429-googleapis/` → `/blog/429-googleapis/`), canonical + JSON-LD
   in rendered HTML.
5. Theme toggle works, persists, no FOUC; lotties animate in both themes; mobile
   hamburger works.

Only after all five pass: merge `astro-migration` → `main` (triggers deploy).

## Risks / notes

- GitHub GraphQL at build: already proven to work in Actions with `secrets.GITHUB_TOKEN`
  (current `fetch.js` uses it). Local builds without a token use the fallback path.
- Pinned repos remain hidden (`openSource.display=false` equivalent): only the profile
  card is shown, matching current behavior.
- Old `developerFolio` repo is already retired; not part of this work.
