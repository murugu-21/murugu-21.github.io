# SDE Journey

My technical blog on my experiences and opinions with current tech stacks, served at [murugappan.dev/blog](https://murugappan.dev/blog). Built with [Astro](https://astro.build) (migrated from Gatsby).

## 🚀 Quick start

```shell
yarn          # install dependencies
yarn dev      # start the dev server at http://localhost:4321/blog
yarn build    # build the production site to ./dist
yarn serve    # preview the production build locally
yarn format   # format the codebase with prettier
```

## 🧐 What's inside?

    .
    ├── content/blog/        # one directory per post: <slug>/index.md (+ images)
    │   └── draft/           # drafts — visible in dev, excluded from production builds
    ├── public/              # static files copied verbatim (robots.txt, manifest, sw.js)
    ├── src/
    │   ├── components/      # Astro head + React islands (search, tags, theme toggle, bio)
    │   ├── layouts/         # BaseLayout.astro (header, theme bootstrap, mermaid renderer)
    │   ├── pages/           # index, [...slug] post pages, 404, rss.xml, llms.txt
    │   ├── utils/           # post helpers (sorting, excerpt, reading time)
    │   ├── consts.js        # site metadata
    │   └── content.config.ts# blog content collection schema
    └── astro.config.mjs     # site/base config, prism highlighting, sitemap, react

## ✍️ Writing a post

Create `content/blog/<slug>/index.md` with frontmatter:

```yaml
---
title: My post title
date: "2026-06-10T10:00:00.000Z"
tags: ["tag-one", "tag-two"]
description: One-line description shown in lists, search and feeds.
---
```

Images placed next to `index.md` can be referenced relatively (`![alt](image.png)`) and are optimized at build time. ` ```mermaid ` code blocks are rendered to diagrams client-side.

## 💫 Deploy

Pushes to `main` trigger `.github/workflows/publish.yml`, which builds the site and publishes `./dist` to the `gh-pages` branch (served by GitHub Pages under `murugappan.dev/blog`).
