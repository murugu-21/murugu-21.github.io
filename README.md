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

## Checks

```bash
npm run check-format   # prettier
npx astro check        # type-check .astro files
```

## Deployment

Cloudflare Pages (git-integrated) builds on every push to `main` with build command `npm ci --prefix blog && npm run build:site` and output directory `dist`. GitHub Actions (`.github/workflows/ci.yml`) runs checks only — format, type-check, blog tests, and a build smoke test.
