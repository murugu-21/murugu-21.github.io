# murugappan.dev

Personal portfolio of Murugappan Sevugan Chetty, built with [Astro 5](https://astro.build) and deployed to GitHub Pages.

**Live site:** https://murugappan.dev

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

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the site on Node 20 and publishes `dist/` to the `gh-pages` branch (served at murugappan.dev via `public/CNAME`). A weekly cron rebuild keeps the build-time GitHub data fresh.
