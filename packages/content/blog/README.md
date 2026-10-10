# Blog

## Write a post

Create `packages/content/blog/<slug>/index.md`. The folder name becomes the URL, `/blog/<slug>/`. Put images in the same folder and link them relatively. Drafts go in `draft/`, which shows in dev but not in production.

```yaml
---
title: My post title
date: "2026-06-10T10:00:00.000Z"
description: One line, shown in lists, search and feeds.
tags: ["system-design"]
keywords: ["kafka", "outbox"] # optional, for search and SEO only
featured: true # optional, puts it on the homepage
shortTitle: Short title # optional, for the homepage card if the title is long
---
```

A few rules:

- Use `##` and `###` headings. A post with two or more gets a table of contents on wide screens.
- Name the language on code blocks (` ```ts `), or they won't be highlighted.
- For audio, run `bun run audio` after the build. See [read-aloud audio](../../../apps/tts/README.md).

## Diagrams

Write diagrams as ` ```mermaid ` code blocks. The build turns each one into images, so readers never load mermaid. The images aren't committed. Only the code block is.

If you change how diagrams look (theme, font), bump `RENDERER_VERSION` in `apps/site/src/lib/blog/mermaid-diagrams.ts` so they all re-render. `bun run diagrams --force` re-renders everything by hand.

The build fails if a post is missing a diagram. Without that check, a broken post would ship blank, because Astro only logs the error and caches the empty page.

## Tags

Tags are the filter chips on the blog index, so keep them broad. Give each post 1 to 3, lowercase and singular. Specific terms like `kafka` go in `keywords` instead. An unknown tag fails the build.

| Tag             | Covers                                                  |
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

To add a tag, add it to `BLOG_TAGS` in `packages/contracts/blog.ts` and to this table. A tag no post uses stays hidden.
