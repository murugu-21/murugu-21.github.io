# Gatsby → Astro Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Gatsby 4 stack with Astro 5 while preserving every user-facing feature of the blog served at `https://murugappan.dev/blog`.

**Architecture:** Static Astro site (`site: https://murugappan.dev`, `base: /blog`). Markdown posts stay in `content/blog/` and load through an Astro content collection (glob loader). Interactive pieces (search + tag filter, theme toggle, bio) stay as React islands via `@astrojs/react`. Everything Gatsby did through plugins is replaced by Astro equivalents: Prism syntax highlighting, rehype autolink headers, `@astrojs/rss`, `@astrojs/sitemap`, static `manifest.webmanifest`, inline gtag, an `llms.txt` endpoint, and a self-destroying `sw.js` to evict the old gatsby-plugin-offline service worker from returning visitors.

**Tech Stack:** Astro 5, @astrojs/react (React 18), @astrojs/rss, @astrojs/sitemap, rehype-slug, rehype-autolink-headings, reading-time, markdown-it + sanitize-html (RSS body), @fontsource fonts, prismjs (theme CSS), mermaid (client-side), react-toggle.

---

## Feature inventory (parity checklist)

Source of truth gathered from gatsby-config.js / gatsby-node.js / gatsby-browser.js / gatsby-ssr.js / src/:

| #   | Feature                                                                                                                             | Gatsby impl                                             | Astro impl                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Posts from `content/blog/**/index.md`, slug = dir name                                                                              | source-filesystem + transformer-remark + createFilePath | content collection, glob loader, `generateId` strips `/index.md`                      |
| 2   | Drafts (`content/blog/draft/**`) excluded in prod, visible in dev                                                                   | source-filesystem `ignore`                              | filter `id.startsWith("draft/")` when `import.meta.env.PROD`                          |
| 3   | Index: list all posts desc by date, search box, tag filter w/ counts, reading time, "No matching article found"                     | React page + AllPosts                                   | `index.astro` + AllPosts React island (`client:load`)                                 |
| 4   | Post page: title, date "MMMM DD, YYYY", ☕ reading time, rendered markdown, Bio footer, prev/next links (date ASC order)            | blog-post.js template                                   | `[...slug].astro` via `getStaticPaths`                                                |
| 5   | Markdown images optimized                                                                                                           | gatsby-remark-images                                    | Astro built-in (relative images in collections)                                       |
| 6   | Code highlighting (PrismJS, `prism.css` theme)                                                                                      | gatsby-remark-prismjs                                   | `markdown.syntaxHighlight: "prism"` + `import "prismjs/themes/prism.css"`             |
| 7   | Heading anchor links (`a.anchor` with svg, styled in style.css)                                                                     | gatsby-remark-autolink-headers                          | rehype-slug + rehype-autolink-headings (prepend, class `anchor`, same svg)            |
| 8   | Smart quotes                                                                                                                        | gatsby-remark-smartypants                               | Astro default (`smartypants: true`)                                                   |
| 9   | Mermaid ```mermaid blocks rendered client-side to `<figure class="mermaid-diagram">`                                                | gatsby-browser onRouteUpdate + `__name` shim            | layout `<script>` w/ dynamic `import("mermaid")` (no shim needed — Vite, not webpack) |
| 10  | Dark/light theme: pre-paint inline script, body class, localStorage + prefers-color-scheme, `__setPreferredTheme`, two change hooks | gatsby-ssr setPreBodyComponents                         | identical inline script at top of `<body>`                                            |
| 11  | Theme toggle (react-toggle, sun/moon icons)                                                                                         | themeToggle.js + StaticImage                            | ThemeToggle.jsx island, plain `<img>` from imported assets                            |
| 12  | Bio with avatar + theme-dependent GitHub icon + StackOverflow link                                                                  | bio.js + StaticImage                                    | Bio.jsx island                                                                        |
| 13  | SEO head: title template `%s \| SDE Journey`, description, canonical = origin + pathname, og:_, twitter:_                           | seo.js (react-helmet)                                   | `BaseHead.astro`                                                                      |
| 14  | RSS at `/blog/rss.xml` (title, date, url/guid, description=excerpt, content:encoded=html)                                           | gatsby-plugin-feed                                      | `src/pages/rss.xml.js` + @astrojs/rss (markdown-it render)                            |
| 15  | Sitemap `/blog/sitemap-index.xml`                                                                                                   | gatsby-plugin-sitemap                                   | @astrojs/sitemap                                                                      |
| 16  | `llms.txt` (title, desc, posts list w/ desc/excerpt)                                                                                | gatsby-node onPostBuild                                 | `src/pages/llms.txt.js` endpoint                                                      |
| 17  | Web manifest (SWE Journey, #057b01, minimal-ui, 640px icon)                                                                         | gatsby-plugin-manifest                                  | static `public/manifest.webmanifest` + icon + `<link>`                                |
| 18  | Offline service worker                                                                                                              | gatsby-plugin-offline                                   | **dropped**; ship self-destroying `public/sw.js` so old SW unregisters                |
| 19  | Google Analytics gtag `G-EGG005JECM` in head                                                                                        | gatsby-plugin-gtag                                      | inline gtag snippet in BaseHead                                                       |
| 20  | Fonts Montserrat + Merriweather                                                                                                     | typeface-\* pkgs                                        | @fontsource imports                                                                   |
| 21  | robots.txt                                                                                                                          | static/                                                 | public/ (fix stale sitemap URL → murugappan.dev/blog)                                 |
| 22  | 404 page                                                                                                                            | 404.js                                                  | 404.astro                                                                             |
| 23  | GH Pages deploy from `public/`                                                                                                      | publish.yml                                             | publish.yml → `./dist`                                                                |
| 24  | `using-typescript.tsx` starter page                                                                                                 | Gatsby starter cruft about Gatsby itself                | **dropped** (not linked anywhere)                                                     |

Reading time: Gatsby `timeToRead` ≈ words/265; replacement uses `reading-time` pkg (words/200) — acceptable drift, same ☕/🍱 formatting via ported `formatReadingTime`.

Excerpt: Gatsby `excerpt(pruneLength: 160)` → `excerpt(body)` helper: strip markdown/code, collapse whitespace, prune to 160 chars on a word boundary + `…`. Used as fallback description (index cards, search corpus, post meta, RSS, llms.txt).

---

### Task 1: Branch + Astro scaffold

**Files:**

- Create: `astro.config.mjs`, `tsconfig.json`, `src/content.config.ts`
- Modify: `package.json`, `.gitignore`, `.prettierignore`

- [ ] **Step 1:** `git checkout -b migrate-astro`
- [ ] **Step 2:** Rewrite `package.json` (same name/author/etc.):

```json
{
  "scripts": {
    "dev": "astro dev",
    "start": "astro dev",
    "build": "astro build",
    "serve": "astro preview",
    "format": "prettier --write \"**/*.{js,jsx,ts,tsx,astro,json,md,css}\"",
    "test": "node scripts/verify-build.mjs"
  },
  "dependencies": {
    "astro": "^5",
    "@astrojs/react": "^4",
    "@astrojs/rss": "^4",
    "@astrojs/sitemap": "^3",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-toggle": "^4.1.2",
    "rehype-slug": "^6",
    "rehype-autolink-headings": "^7",
    "reading-time": "^1.5.0",
    "markdown-it": "^14",
    "sanitize-html": "^2",
    "mermaid": "^11.15.0",
    "prismjs": "^1.28.0",
    "@fontsource/montserrat": "^5",
    "@fontsource/merriweather": "^5"
  },
  "devDependencies": {
    "prettier": "^2.7.1",
    "prettier-plugin-astro": "^0.14.1"
  }
}
```

- [ ] **Step 3:** `astro.config.mjs`:

```js
import { defineConfig } from "astro/config"
import react from "@astrojs/react"
import sitemap from "@astrojs/sitemap"
import rehypeSlug from "rehype-slug"
import rehypeAutolinkHeadings from "rehype-autolink-headings"
import { autolinkConfig } from "./src/utils/rehype-autolink-config.mjs"

export default defineConfig({
  site: "https://murugappan.dev",
  base: "/blog",
  integrations: [react(), sitemap()],
  markdown: {
    syntaxHighlight: "prism",
    rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, autolinkConfig]],
  },
})
```

- [ ] **Step 4:** `src/content.config.ts`:

```ts
import { defineCollection, z } from "astro:content"
import { glob } from "astro/loaders"

const blog = defineCollection({
  loader: glob({
    pattern: "**/index.md",
    base: "./content/blog",
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, ""),
  }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    tags: z.array(z.string()),
  }),
})

export const collections = { blog }
```

- [ ] **Step 5:** `.gitignore`: replace `.cache/`+`public` block with `dist/` and `.astro/`. `.prettierignore`: add `dist`, `.astro`, `yarn.lock`.
- [ ] **Step 6:** `yarn install` (regenerates yarn.lock). Expect success.
- [ ] **Step 7:** Commit `chore: swap gatsby deps for astro scaffold`

### Task 2: Utilities

**Files:** Create `src/consts.js`, `src/utils/posts.js`, `src/utils/rehype-autolink-config.mjs`. Keep `src/utils/helpers.js` as-is.

- [ ] **Step 1:** `src/consts.js` — port siteMetadata verbatim (title `SDE Journey`, author name/summary, description, siteUrl `https://murugappan.dev/blog`, twitter `murugu21`).
- [ ] **Step 2:** `src/utils/posts.js`:

````js
import { getCollection } from "astro:content"
import getReadingTime from "reading-time"

export async function getPublishedPosts() {
  const posts = await getCollection(
    "blog",
    p => !(import.meta.env.PROD && p.id.startsWith("draft/")),
  )
  return posts.sort((a, b) => a.data.date - b.data.date) // ASC like gatsby-node
}

export const postPath = id =>
  `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${id}/`

export function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  })
}

export const timeToRead = body =>
  Math.max(1, Math.ceil(getReadingTime(body || "").minutes))

export function excerpt(body, length = 160) {
  const text = (body || "")
    .replace(/^---[\s\S]*?---/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (text.length <= length) return text
  return text.slice(0, length).replace(/\s+\S*$/, "") + "…"
}
````

- [ ] **Step 3:** `src/utils/rehype-autolink-config.mjs` — prepend an `a.anchor` link containing the same GitHub-style link svg gatsby-remark-autolink-headers used (`aria-hidden`, `focusable=false`), `properties: { class: "anchor", ariaHidden: "true", tabIndex: -1 }`.
- [ ] **Step 4:** Commit.

### Task 3: Layout + head + theme

**Files:** Create `src/layouts/BaseLayout.astro`, `src/components/BaseHead.astro`. Keep `src/style.css`, `src/normalize.css`, `src/components/customToggle.css` (rename `.gatsby-highlight` rule selector to `pre[class*="language-"]` margin).

- [ ] **Step 1:** `BaseHead.astro`: charset/viewport, `<title>{title} | SDE Journey</title>`, canonical `new URL(Astro.site).origin + Astro.url.pathname`, description/og/twitter meta (port from seo.js), favicon + manifest links, gtag async script + inline config for `G-EGG005JECM`.
- [ ] **Step 2:** `BaseLayout.astro`: imports fonts (`@fontsource/montserrat/{400,700,900}.css`, `@fontsource/merriweather/{400,400-italic,700,900}.css`), `normalize.css`, `style.css`, `prismjs/themes/prism.css`, `customToggle.css`. Body starts with the **verbatim** theme inline script from gatsby-ssr.js (`<script is:inline>`). `.global-wrapper` + header (h1 `.main-heading` link when `isRoot`, `.header-link-home` otherwise — prop `isRoot`), `<ThemeToggle client:load />`, `<main><slot /></main>`. Ends with mermaid `<script>` (port from gatsby-browser.js minus the `__name` shim and route-update wrapper; run on load if `code.language-mermaid` exists).
- [ ] **Step 3:** Commit.

### Task 4: React islands

**Files:** Create `src/components/ThemeToggle.jsx`, `Bio.jsx`, `AllPosts.jsx`, `Post.jsx`, `SearchBar.jsx`, `TagBar.jsx`, `Tag.jsx` (port from .js versions: `gatsby Link`→`<a href>`, `StaticImage`→`<img src={imported.src}>`, data via props). Delete old `.js` versions.

- [ ] **Step 1:** Port Tag/TagBar/SearchBar unchanged (already pure React).
- [ ] **Step 2:** `Post.jsx`: takes pre-serialized `post` `{href,title,dateFormatted,minutes,tags,searchableText,descriptionHtml}`; renders as before with `formatReadingTime(minutes)`.
- [ ] **Step 3:** `AllPosts.jsx`: same search/tag logic over serialized posts.
- [ ] **Step 4:** `ThemeToggle.jsx` + `Bio.jsx`: port, images via `import sun from "../images/sun.png"` etc., `<img width=.. height=.. src={sun.src}>`.
- [ ] **Step 5:** Commit.

### Task 5: Pages + endpoints

**Files:** Create `src/pages/index.astro`, `src/pages/[...slug].astro`, `src/pages/404.astro`, `src/pages/rss.xml.js`, `src/pages/llms.txt.js`. Delete `src/pages/*.js|tsx`, `src/templates/`, `gatsby-*.js`.

- [ ] **Step 1:** `index.astro`: `getPublishedPosts()`, reverse to DESC, serialize for AllPosts, render in BaseLayout(isRoot) + `<Bio client:load />`.
- [ ] **Step 2:** `[...slug].astro`: `getStaticPaths` from `getPublishedPosts()` (ASC) with prev/next neighbors in props; render via `render(entry)`; article markup ported from blog-post.js (`itemScope`→`itemscope` etc.), prev/next `<a rel="prev|next">`, Bio footer.
- [ ] **Step 3:** `404.astro`: ported text.
- [ ] **Step 4:** `rss.xml.js`: @astrojs/rss; items DESC by date: `title`, `pubDate`, `link: postPath(id)`, `description: description || excerpt(body)`, `content: sanitizeHtml(markdownIt.render(body))`; feed title `SDE Journey RSS Feed` (renamed from "Gatsby Starter Blog RSS Feed").
- [ ] **Step 5:** `llms.txt.js`: GET endpoint reproducing gatsby-node onPostBuild output exactly (`# title`, `> description — by author.`, `## Posts`, `- [title](siteUrl + /id/): desc`).
- [ ] **Step 6:** Commit.

### Task 6: Static assets + deploy

**Files:** Create `public/robots.txt` (sitemap → `https://murugappan.dev/blog/sitemap-index.xml`), `public/manifest.webmanifest`, `public/icon.png` (copy of src/images/icon.png), `public/sw.js` (self-destroying). Modify `.github/workflows/publish.yml` (`publish_dir: ./dist`), `README.md`. Delete `static/`, gatsby config files, `src/components/seo.js`, `src/components/layout.js`.

- [ ] **Step 1:** Write assets; manifest: name/short_name `SWE Journey`, `start_url: "/blog/"`, `background_color: "#ffffff"`, `theme_color: "#057b01"`, `display: "minimal-ui"`, icon `/blog/icon.png` 640x640 any maskable.
- [ ] **Step 2:** `public/sw.js`:

```js
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", () => {
  self.registration
    .unregister()
    .then(() => self.clients.matchAll())
    .then(clients => clients.forEach(c => c.navigate(c.url)))
})
```

- [ ] **Step 3:** Delete all gatsby files/dirs; update workflow + README.
- [ ] **Step 4:** Commit.

### Task 7: Build verification

- [ ] **Step 1:** `yarn build` — expect success, no draft pages in `dist/`.
- [ ] **Step 2:** Assert dist contents: `index.html`, one dir per post (8 published), `404.html`, `rss.xml`, `sitemap-index.xml`, `llms.txt`, `manifest.webmanifest`, `robots.txt`, `sw.js`, optimized images in `_astro/`.
- [ ] **Step 3:** Grep built HTML: canonical `https://murugappan.dev/blog/...`, title template, og/twitter meta, gtag id, theme script, manifest link; post HTML has prism classes, heading anchors, prev/next links; rss.xml + sitemap URLs carry `/blog/` prefix.
- [ ] **Step 4:** `yarn dev` quick check: draft post route `/blog/draft/js-closure/` exists in dev.
- [ ] **Step 5:** Commit any fixes.

### Task 8: Functional browser testing (astro preview + chrome-devtools MCP)

- [ ] Homepage: posts listed DESC w/ dates + ☕ reading time + tag chips; fonts/styles applied.
- [ ] Search: type "rate" → only rate-limiting posts; gibberish → "No matching article found".
- [ ] Tag filter: counts shown; select tag filters list; combined with search; deselect restores.
- [ ] Theme: toggle switches body class dark/light, persists across reload (localStorage), Bio GitHub icon swaps.
- [ ] Post page: content, images, code highlighting, heading anchor links, date + reading time, prev/next navigation works both directions.
- [ ] Mermaid: `/blog/cloud-agnostic-rate-limiting/` renders `<figure class="mermaid-diagram"><svg>`.
- [ ] 404 page renders with layout.
- [ ] No console errors on any page.
- [ ] `/blog/rss.xml`, `/blog/llms.txt`, `/blog/sitemap-index.xml`, `/blog/manifest.webmanifest` respond correctly.

### Task 9: Finish

- [ ] Re-run `yarn build` clean; `git status` clean; final commit; report parity table + known intentional changes (offline SW dropped, reading-time WPM drift, RSS feed title renamed, using-typescript page removed).
