# Cloudflare Pages Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combine the Astro blog (sibling folder `~/personal/blog`, branch `migrate-astro`) into this repo as `blog/` and serve portfolio + blog from one Cloudflare Pages project with true 301 redirects, edge caching headers, and a single deploy workflow.

**Architecture:** Two Astro apps in one repo — portfolio at root, blog in `blog/` (own config, `base: "/blog"`). A root `build:site` script builds both and merges blog output into `dist/blog/`. GitHub Actions builds and uploads `dist/` to the `murugappan-dev` Cloudflare Pages project via wrangler (direct upload). gh-pages dual-publish is kept until the Cloudflare cutover is verified.

**Tech Stack:** Astro 5 ×2, Node 20, wrangler / cloudflare/wrangler-action, Cloudflare Pages `_redirects`/`_headers`.

**Branch:** `cloudflare-pages-monorepo` (exists; spec committed).
**Spec:** `docs/superpowers/specs/2026-06-10-cloudflare-pages-monorepo-design.md`

Known facts the executor needs:
- Blog source of truth: `/Users/murugappan/personal/blog` working tree (branch `migrate-astro`, clean). Scripts: `build`, `dev`, `format`, `test` (= `astro check`). Uses yarn.lock (convert to npm). `astro.config.mjs` has `site: "https://murugappan.dev"`, `base: "/blog"`.
- Blog theme: `src/layouts/BaseLayout.astro` persists localStorage key `"theme"` (string values). Portfolio uses key `isDark` (JSON bool, set by `src/layouts/Layout.astro` pre-paint + `src/components/ThemeToggle.astro`).
- Blog `public/` contains its own `robots.txt` (delete — only root robots.txt is honored by crawlers) and `sw.js` (inspect, keep as-is unless it's clearly a leftover).
- Cloudflare Pages serves `404.html` if present at dist root; otherwise it falls back to `index.html` (soft-404). Portfolio has no 404 page yet — must add one.
- Portfolio deploy workflow: `.github/workflows/deploy.yml` (Node 20, npm ci, check-format, astro check, build, JamesIves gh-pages deploy with `REQUIRE_GITHUB_PROFILE` on schedule).

---

## File structure (target)

```
blog/                          blog Astro app (copied; no node_modules/dist/.git)
  package.json + package-lock.json (converted from yarn)
src/pages/404.astro            NEW portfolio 404 page
public/_redirects              NEW true 301s
public/_headers                NEW caching + security headers
public/robots.txt              MODIFIED blog sitemap path
package.json                   build:blog + build:site scripts
.gitignore                     blog/node_modules, blog/dist
.github/workflows/deploy.yml   wrangler deploy + dual-publish
.github/workflows/prettier.yml extended to blog format check
```

---

### Task 1: Import the blog app as `blog/`

**Files:** Create `blog/**` (copy), delete `blog/yarn.lock`, create `blog/package-lock.json`

- [ ] **Step 1:** Verify source clean: `git -C /Users/murugappan/personal/blog status --short` → empty; `git -C /Users/murugappan/personal/blog branch --show-current` → `migrate-astro`.
- [ ] **Step 2:** Copy (exclude build/dep/git artifacts):
```bash
cd /Users/murugappan/personal/murugu-21.github.io
rsync -a --exclude node_modules --exclude dist --exclude .git --exclude .astro \
  /Users/murugappan/personal/blog/ blog/
```
- [ ] **Step 3:** Convert lockfile: `cd blog && rm yarn.lock && nvm use 20 && npm install` (creates package-lock.json). Then prove reproducibility: `rm -rf node_modules && npm ci`.
- [ ] **Step 4:** Blog checks/build inside the monorepo: `npm --prefix blog run test` (astro check, expect 0 errors) and `npm --prefix blog run build` → `blog/dist/index.html` exists and `grep -c '/blog/' blog/dist/index.html` ≥ 1 (base applied).
- [ ] **Step 5:** Inspect `blog/public/sw.js` — if it is an unregister/cleanup stub (Gatsby-offline removal pattern), keep; if it's a caching service worker, keep too but note it in the report (no behavior change in this task). Delete `blog/public/robots.txt` (crawlers ignore non-root robots; avoids confusion): `git rm` after staging — i.e. `rm blog/public/robots.txt` before the add.
- [ ] **Step 6:** Append to root `.gitignore`:
```
blog/node_modules
blog/dist
blog/.astro
```
- [ ] **Step 7:** Commit: `git add blog .gitignore && git commit -m "feat: import Astro blog app as blog/ (npm lockfile, monorepo)"` + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Verify `git status --short` clean and `git ls-files blog | wc -l` is plausible (no node_modules tracked: `git ls-files blog | grep -c node_modules` → 0).

### Task 2: Root build orchestration

**Files:** Modify `package.json` (root)

- [ ] **Step 1:** Add scripts to root package.json:
```json
"build:blog": "npm --prefix blog run build",
"build:site": "npm run build && npm run build:blog && rm -rf dist/blog && cp -R blog/dist/. dist/blog/"
```
- [ ] **Step 2:** Run `npm run build:site` (Node 20). Verify merge:
```bash
ls dist/index.html dist/blog/index.html dist/blog/429-googleapis/index.html dist/blog/rss.xml dist/blog/sitemap-index.xml dist/blog/llms.txt
grep -c 'href="/blog/' dist/blog/index.html   # ≥1 (blog links carry base)
ls dist/CNAME dist/llms.txt dist/robots.txt    # portfolio passthrough intact
```
- [ ] **Step 3:** Commit `package.json`: `feat: single build:site command producing merged dist (portfolio + /blog)`.

### Task 3: Theme continuity across apps

**Files:** Modify `blog/src/layouts/BaseLayout.astro` (and any blog toggle component it wires)

- [ ] **Step 1:** Read the blog's theme code: `sed -n '30,90p' blog/src/layouts/BaseLayout.astro`. It reads/writes localStorage key `"theme"` with string values.
- [ ] **Step 2:** Align to the portfolio's contract — key `isDark`, JSON bool (`"true"`/`"false"`): replace `localStorage.getItem("theme")` logic with `JSON.parse(localStorage.getItem("isDark"))` (guarded by try/catch, `prefers-color-scheme` fallback when null) and `localStorage.setItem("theme", newTheme)` with `localStorage.setItem("isDark", JSON.stringify(newTheme === "dark"))` — keep the blog's internal "dark"/"light" mechanics; only the PERSISTENCE format changes. Preserve their pre-paint semantics.
- [ ] **Step 3:** Verify: `npm --prefix blog run build` then `grep -o 'isDark' blog/dist/index.html | head -2` (≥1) and `grep -c 'getItem("theme")' -r blog/src` → 0.
- [ ] **Step 4:** Manual check happens at the Task 8 preview gate (toggle on portfolio → navigate to /blog → same theme). Commit: `fix: blog persists theme as isDark JSON bool, shared with portfolio`.

### Task 4: Portfolio 404 page

**Files:** Create `src/pages/404.astro`

- [ ] **Step 1:** Create a minimal on-theme 404 (uses existing Layout; CF Pages serves dist/404.html for any unknown path, preventing the soft-404 index.html fallback):
```astro
---
import Layout from "../layouts/Layout.astro";
---
<Layout title="404 — Page not found | Murugappan M">
  <main class="notfound-main">
    <h1>404</h1>
    <p>This page doesn't exist. Try the <a href="/">portfolio</a> or the <a href="/blog/">blog</a>.</p>
  </main>
</Layout>
<style lang="scss">
  @import "../styles/variables";
  .notfound-main {
    min-height: 60vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    h1 { font-size: 72px; color: $buttonColor; margin: 0; }
    a { color: $buttonColor; }
  }
</style>
```
- [ ] **Step 2:** `npm run build && ls dist/404.html` → exists. `npx astro check` 0 errors. Commit: `feat: 404 page (prevents CF Pages soft-404 index fallback)`.

### Task 5: `_redirects`, `_headers`, robots fix

**Files:** Create `public/_redirects`, `public/_headers`; modify `public/robots.txt`

- [ ] **Step 1:** `public/_redirects`:
```
/429-googleapis/ /blog/429-googleapis/ 301
/cloud-agnostic-rate-limiting/ /blog/cloud-agnostic-rate-limiting/ 301
/coin-change-problem/ /blog/coin-change-problem/ 301
/first-post/ /blog/first-post/ 301
/gastby/ /blog/gastby/ 301
/react/ /blog/react/ 301
/toolbox/ /blog/toolbox/ 301
```
- [ ] **Step 2:** `public/_headers`:
```
/static/*
  Cache-Control: public, max-age=31536000, immutable
/blog/_astro/*
  Cache-Control: public, max-age=31536000, immutable
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
```
(Blog hashed assets live under `/blog/_astro/` — verify with `ls dist/blog/_astro | head -3` after a build; portfolio's under `/static/`. Adjust if the actual built paths differ.)
- [ ] **Step 3:** `public/robots.txt`: replace the line `Sitemap: https://murugappan.dev/blog/sitemap/sitemap-index.xml` with `Sitemap: https://murugappan.dev/blog/sitemap-index.xml` (keep the rest).
- [ ] **Step 4:** `npm run build:site && ls dist/_redirects dist/_headers && grep 'blog/sitemap-index' dist/robots.txt`. NOTE: the 7 stub directories in `public/` stay for now (spec: removed only after GH Pages retirement). Commit: `feat: CF redirects (true 301s), cache/security headers, robots sitemap path`.

### Task 6: Deploy workflow → Cloudflare (with gh-pages dual-publish)

**Files:** Modify `.github/workflows/deploy.yml`, `.github/workflows/prettier.yml`

- [ ] **Step 1:** Rewrite `deploy.yml`:
```yaml
name: Build and Deploy
on:
  workflow_dispatch:
  push:
    branches:
      - main
  schedule:
    - cron: "0 12 * * 1" # weekly refresh of build-time GitHub data
permissions:
  contents: write # gh-pages dual-publish during transition
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: |
            package-lock.json
            blog/package-lock.json
      - run: npm ci
      - run: npm ci --prefix blog
      - run: npm run check-format
      - run: npx astro check
      - run: npm --prefix blog run test
      - run: npm run build:site
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REQUIRE_GITHUB_PROFILE: ${{ github.event_name == 'schedule' && '1' || '' }}
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name=murugappan-dev
      - name: Dual-publish to gh-pages (transition rollback path)
        if: github.ref == 'refs/heads/main'
        uses: JamesIves/github-pages-deploy-action@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          branch: gh-pages
          folder: dist
```
- [ ] **Step 2:** `prettier.yml`: after `npm ci` add `- run: npm ci --prefix blog` and a blog format check step `- run: npm --prefix blog run format -- --check` — BUT check the blog's format script signature first (`--write` baked in): if so, add a `check-format` script to blog/package.json (`prettier --check "**/*.{js,jsx,ts,tsx,astro,json,md,css}"`) and call that instead.
- [ ] **Step 3:** Commit: `ci: build both apps, deploy merged dist to Cloudflare Pages, keep gh-pages dual-publish`.

### Task 7: USER GATE — Cloudflare credentials + project (checkpoint, controller handles)

Cannot proceed past this without the user:
1. Cloudflare dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"-style custom token with **Account / Cloudflare Pages / Edit** permission.
2. Account ID: any zone overview page, right column.
3. GitHub repo `murugu-21/murugu-21.github.io` → Settings → Secrets and variables → Actions → add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
4. Cloudflare dashboard → Workers & Pages → Create application → Pages → "Upload assets" (Direct Upload) → project name **murugappan-dev** → create (skip the actual upload; CI does it).

### Task 8: Preview deploy + verification gate (pages.dev)

- [ ] **Step 1:** Push the branch; run the workflow on it: `gh workflow run "Build and Deploy" --ref cloudflare-pages-monorepo` (or the user clicks Run workflow). Branch runs deploy as a Pages PREVIEW (wrangler auto-detects non-production branch) — grab the preview URL from the run logs (`*.murugappan-dev.pages.dev`).
- [ ] **Step 2:** Verify against the preview URL:
```bash
P=<preview-url>
curl -s -o /dev/null -w "%{http_code}\n" $P/                       # 200
curl -s -o /dev/null -w "%{http_code}\n" $P/blog/                  # 200
curl -s -o /dev/null -w "%{http_code}\n" $P/blog/429-googleapis/   # 200
curl -sI $P/429-googleapis/ | grep -iE "^HTTP|^location"           # 301 + /blog/429-googleapis/
curl -sI $P/static/$(basename $(ls dist/static/*.css | head -1)) | grep -i cache-control  # immutable
curl -s -o /dev/null -w "%{http_code}\n" $P/definitely-not-a-page  # 404 (not 200 soft-404)
for u in llms.txt robots.txt sitemap.xml og-image.png resume.pdf blog/rss.xml blog/sitemap-index.xml blog/llms.txt; do curl -s -o /dev/null -w "$u %{http_code}\n" $P/$u; done   # all 200
```
- [ ] **Step 3:** Browser checks on the preview: portfolio renders (GitHub card present), blog home + one post render styled, theme toggled on portfolio persists into /blog (and vice versa), mermaid/prism render on the rate-limiting post.
- [ ] **Step 4:** Fix anything found (commit), re-run, then merge to main: `git checkout main && git merge --no-ff cloudflare-pages-monorepo && git push origin main` → production deploy lands on `murugappan-dev.pages.dev` + gh-pages dual-publish. Verify production pages.dev URL same checks.

### Task 9: USER GATE — domain cutover

User in Cloudflare dashboard:
1. Workers & Pages → murugappan-dev → Custom domains → Set up a domain → `murugappan.dev` (CF replaces the GitHub A records with a proxied CNAME automatically — confirm the prompt).
2. Zone → Rules → Redirect Rules → create: if hostname equals `www.murugappan.dev` → 301 to `https://murugappan.dev` + preserve path/query. (Ensure a proxied AAAA/A or CNAME record exists for `www` so the rule can fire; if `www` currently points at murugu-21.github.io DNS-only, flip it to proxied.)

### Task 10: Live verification + retirement

- [ ] **Step 1:** Wait for DNS/cert, then run the Task 8 Step 2 suite against `https://murugappan.dev` + `curl -sI https://www.murugappan.dev/ | grep -iE "^HTTP|location"` (301 → apex). TTFB compare: `for i in 1 2 3; do curl -s -o /dev/null -w "%{time_starttransfer}\n" https://murugappan.dev/; done` vs the pre-cutover baseline (record baseline BEFORE the user does Task 9).
- [ ] **Step 2:** Lighthouse on live (chrome-devtools MCP by controller): expect ≥ 100/100/100 maintained.
- [ ] **Step 3:** Retirement commit: delete the 7 stub dirs (`git rm -r public/429-googleapis public/cloud-agnostic-rate-limiting public/coin-change-problem public/first-post public/gastby public/react public/toolbox`), delete `public/CNAME`, remove the gh-pages dual-publish step + `permissions: contents: write` from deploy.yml. Build + verify `_redirects` still lands. Commit: `chore: retire GitHub Pages artifacts (stubs, CNAME, dual-publish)`. Push.
- [ ] **Step 4:** USER: GitHub repo Settings → Pages → disable (Source: none) on this repo AND murugu-21/blog; archive `murugu-21/blog` (Settings → Archive). Old `gh-pages` branch may be deleted.
- [ ] **Step 5:** Update memory file `portfolio-astro-architecture.md` (hosting = Cloudflare Pages, monorepo with blog/, deploy chain) and the repo README (one section: monorepo layout + CF deploy).

---

## Self-review

- **Spec coverage:** import-as-blog/ + lockfile (T1), single build (T2), theme continuity (T3), 404 soft-404 guard (T4 — added beyond spec after CF behavior check; consistent with spec's verification gate), redirects/headers/robots (T5), workflow + dual-publish + secrets (T6/T7), preview gate (T8), cutover + www rule (T9), live verify + retirement + archive + memory (T10). Stub/CNAME retention until retirement honored (T5 note, T10 step 3).
- **Placeholders:** none; all code/commands concrete. `<preview-url>` is a runtime value captured in T8 Step 1.
- **Consistency:** script names (`build:site`, `build:blog`) consistent T2→T6/T8; secrets names consistent T6/T7; blog asset path `/blog/_astro/` flagged for verification in T5.
