# Site

## Folders

```text
pages/        routes
layouts/      Layout.astro wraps every page, BlogLayout.astro adds the blog header
components/   shared by every page
  home/       homepage only
  blog/       blog only
  chat/       the Jarvis chat widget
  resume/     resume only
  ui/         shadcn components
lib/          shared logic, with blog/ for blog-only logic
styles/       global.css (Tailwind), resume.css, and blog/
data/         logo images for packages/content/portfolio.ts
```

Put a file in the narrowest folder that covers everything that imports it. Shared code can't import from `home/` or `blog/`, and lint enforces that. The homepage may import blog code, because it shows featured posts.

## Analytics

The site uses [PostHog](https://posthog.com). It's off unless the build has `POST_HOG_TOKEN` and `POST_HOG_URL`.

Use the helpers in `lib/analytics.ts`: `track()` for events, `tag()` for a property on every event, and `reportError()` for errors you catch. They're safe to call anywhere, even when PostHog isn't loaded. To track a link click, add `data-ph-event` to the link.

Things to know:

- PostHog loads on the visitor's first input, or after 10 seconds, so it doesn't slow down Lighthouse scores.
- Events go to `e.murugappan.dev`, PostHog's own proxy. Keep that DNS record unproxied (grey cloud) in Cloudflare, or PostHog can't renew its certificate.
- Never send anything a visitor typed. Replay masks inputs and the chat transcript, and URLs have their search and tag params masked.
- Session replay and error tracking also have to be switched on in the PostHog project.

## Resume

`/resume` is a print-styled page built from the same content as the site. After every build, `scripts/generate-resume.ts` prints it to `resume.pdf` with headless Chromium. The build fails if the PDF's text can't be extracted, since job sites need to parse it.

The phone number isn't in the repo. Set `RESUME_PHONE` to add it.
