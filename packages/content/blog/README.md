# Blog

```text
packages/content/blog/          # one directory per post: <slug>/index.md (+ images)
  draft/               # drafts: visible in dev, excluded from production builds
src/pages/blog/        # index, [...slug] post pages, 404, rss.xml, llms.txt, llms-full.txt
src/layouts/BlogLayout.astro  # the blog header around Layout
src/components/blog/   # search, tags, table of contents, Listen control, bio
packages/content/posts.ts       # PostSource and the pure post helpers (URLs, excerpt, descriptions, summaries)
packages/content/llms.ts        # llms.txt, llms-full.txt and the blog index's markdown rendition
packages/content/vite/posts-plugin.ts  # parses the published posts into virtual:content/posts for the site and the Worker
src/lib/blog/          # Astro post helpers, the markdown plugins, read-aloud text prep
src/styles/blog/       # post and code-block styles
src/content.config.ts  # content collection, validated by packages/contracts/blog.ts
public/blog/           # static files served verbatim (og-image, sw.js)
```

The index mirrors its search box and tag chips into the URL (`/blog/?q=…&tag=…`, one `tag` per chip), so filtered views survive a reload and can be shared. Post pages link their tags to the same URLs. Unknown tags are ignored.

## Writing a post

Create `packages/content/blog/<slug>/index.md`. The directory name is the slug, so the post appears at `/blog/<slug>/` and in the sitemap, RSS feed, both `llms.txt` files and the markdown renditions.

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
- **Listen** audio comes from `bun run audio`, run on a laptop after the build. [`scripts/site/tts/README.md`](../../../scripts/site/tts/README.md) covers the setup.

## Mermaid diagrams

`scripts/site/render-mermaid.ts` renders each ` ```mermaid ` fence to a light and a dark SVG (with a Fira Code subset embedded, so labels measure the same inside `<img>`) and a light PNG, under `packages/content/blog/<slug>/diagrams/`, named by a hash of the fence. It prunes renderings no fence uses.

The renderings are gitignored; only the fence source is committed. `bun run build` renders them first, the markdown plugin renders any fence that has no rendering yet (useful under `astro dev`), and `bun run diagrams` renders on demand. Each file records the mermaid version that rendered it, so an upgrade re-renders automatically; `--force` re-renders everything. If you change the renderer's own output (theme, font), bump `RENDERER_VERSION` in `src/lib/blog/mermaid-diagrams.ts` so the hashes change.

The RSS feed uses the PNG. Feed readers and mirrors like dev.to rasterize images without an HTML engine or web fonts, so mermaid's `foreignObject` labels come out blank in the SVG.

The `blogPostChecks` integration in `astro.config.ts` checks after the build that every post rendered one figure per fence. Without it, a markdown failure would ship a blank article, because the content layer only logs the error and caches the empty result in `node_modules/.astro`. It also checks each post's head: exactly one canonical URL, the post's own, and a `BlogPosting` whose author resolves to the `Person` in the same JSON-LD `@graph`.

## Tag vocabulary

Tags are the index's filter chips, so they name broad reader intents that recur across posts. `BlogFrontmatter` in `packages/contracts/blog.ts` constrains them (an unknown tag fails the build): **1 to 3 per post, lowercase, kebab-case, singular, no vendor names**. Precise terms (`kafka`, `debezium`, `floating-point`) go in `keywords`, which feeds JSON-LD, `article:tag` and the search index but never renders as a chip.

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

To add a tag, add it to `BLOG_TAGS` in `packages/contracts/blog.ts`, document it here and tag the posts it covers. Chips come from post counts, so an unused tag stays hidden.
