# Site

## Source layout

`src/` is grouped by type first. Astro reserves only `src/pages/`, and the other folders follow its documented defaults.

```text
src/pages/        # routes
src/layouts/      # Layout.astro (every page) and BlogLayout.astro
src/components/   # site chrome shared by every page (Header, Icon, ThemeToggle, …)
  home/           # homepage sections and the pieces only they use
  blog/           # blog-only components
  chat/           # the Jarvis widget, on every page
  ui/             # shadcn primitives
src/lib/          # shared logic (site constants, theme, analytics, llms.txt)
  blog/           # blog-only logic
src/styles/       # global.css and the stylesheets it pulls in, plus prose.css
  blog/           # blog-only styles
src/data/         # hand-written portfolio and resume data
```

A file lives in the narrowest folder that holds every importer: a component only the homepage uses goes in `home/`, and one both halves use stays at the root of `components/`.

Lint enforces the direction too (the site-area overrides in `oxlint.config.ts`). Shared code never imports from a `blog/` or `home/` folder, and blog code never imports homepage components. The homepage may import blog code, since it shows the featured posts. Pages compose both halves freely, and so does `lib/llms.ts`, which renders the whole site for agents.

[`content/blog/README.md`](../content/blog/README.md) covers the blog's files, and [`worker/README.md`](../worker/README.md#ai-chat-widget) covers the chat widget in `components/chat/`.

## Analytics

[PostHog](https://posthog.com); see [Build-time environment](../README.md#build-time-environment) for the env vars that turn it on. Replay and error tracking must also be enabled in the PostHog project.

- **Ingestion.** Events go through `https://e.murugappan.dev`, PostHog's managed reverse proxy. It is a CNAME to `…cf-prod-us-proxy.proxyhog.com` (US region), set as the SDK's `api_host`. Nothing in this repo or the Worker sits in that path. The DNS record must stay **DNS only (grey cloud)**, because proxying it breaks PostHog's certificate issuance. `ui_host` stays `https://us.posthog.com` so the toolbar works.
- **Loading.** `posthog-js` is `import()`ed as its own chunk on the first input, or after 10 s without one (`scheduleSdkLoad`), so it stays outside Lighthouse's measured window. The token and host reach the client through `<meta name="ph-token">` and `<meta name="ph-host">`, because Astro bundles `<script>` as a module, where `document.currentScript` is `null`. They're read at build time, so the env vars need no `PUBLIC_` prefix.
- **Session replay** starts on the first pointer, touch, key or wheel event (`onFirstInteraction` in `src/lib/first-interaction.ts`), not on `scroll`, which Chrome fires during load. The recorder is the SDK's heaviest extension, and loading it right after paint counted against Lighthouse's blocking time. Surveys and dead-click capture are off, so the SDK doesn't fetch their scripts.
- **Error tracking.** `capture_exceptions: true` turns uncaught errors and rejections into `$exception` events. Since the SDK waits for the first interaction, `bootAnalytics` listens for `error` and `unhandledrejection` from page load, buffers them, replays them once the SDK arrives, then detaches. Errors the code catches on purpose go through `reportError`.
- **Source maps.** In production builds `@posthog/rollup-plugin` emits hidden source maps, uploads them and deletes the `.map` files, so nothing extra is served. A failed upload fails the build rather than deploying unmapped code.
- **Privacy.** Nothing a visitor types is sent. Replay masks every `<input>` and `<textarea>`, and the chat transcript carries `data-ph-mask="true"` because sent messages render as `<div>`s. Blog filter params (`?q=`, `?tag=`) are stripped from captured URLs (`redactBlogFilters` / `sanitize_properties`).

### Custom events

`src/lib/analytics.ts` wraps PostHog for both halves:

- `track(event, props?)` captures an event.
- `tag(key, value)` registers a super property, which suits anonymous visitors better than person properties.
- `reportError(error, props?)` sends a caught error.

Each one no-ops without the SDK, buffers while it loads and swallows failures, so they're safe to call anywhere. Pageviews, autocapture and heatmaps come from PostHog itself.

Links opt in with `data-ph-event` and optional `data-ph-prop` / `data-ph-value`. A single delegated `click` listener per document handles them, React-rendered markup included. `src/components/SiteScripts.astro`, which `src/layouts/Layout.astro` includes on every page, calls `initClickTracking()`.

| Event                                            | Fired on                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `resume_download`                                | "Download my resume" (also upgrades the session recording)                        |
| `contact_click`                                  | "Contact me"                                                                      |
| `social_click`                                   | any outbound profile link, tagged `social=github\|linkedin\|email\|phone\|x\|rss` |
| `project_click`                                  | a pinned-repo card, tagged `project=<repo>`                                       |
| `more_projects_click`                            | "More Projects"                                                                   |
| `oss_link_click`                                 | an open-source card link, tagged `oss=<name>`                                     |
| `blog_card_click`                                | a homepage blog card, tagged `post=<title>`                                       |
| `chat_open`                                      | the Jarvis launcher is opened                                                     |
| `chat_starter_click`                             | a suggested starter chip                                                          |
| `chat_message_sent`                              | a message is sent (the first also upgrades the recording)                         |
| `chat_limit` / `chat_error`                      | the room replies with a rate limit or an error                                    |
| `chat_restart` / `chat_transcript_download`      | conversation menu actions                                                         |
| `listen_play`                                    | first play on a post, tagged `post=<slug>`                                        |
| `listen_resume` / `listen_pause` / `listen_seek` | transport controls (seek fires once per scrub)                                    |
| `listen_rate`                                    | playback speed changed, tagged `listen_rate=<n>x`                                 |
| `listen_complete`                                | the post was read to the end                                                      |
| `listen_audio_fallback`                          | pre-rendered audio failed and speech synthesis took over                          |
| `listen_unavailable`                             | no backend at all (should never fire: the control hides itself)                   |

Super properties: `theme` (`dark` / `light`, set on load and on every toggle) and `listen_backend` (`audio` / `speech`).

## Resume

`/resume` (`src/pages/resume.astro`) is a print-styled page built entirely from `src/data/portfolio.ts` and `src/data/resume.ts`, so it can't drift from the site.

At the end of `bun run build`, `scripts/site/generate-resume.ts` starts `astro preview` on a fixed port, opens `/resume/` in headless Chromium through Puppeteer and prints `resume.pdf`. It then parses the PDF with `pdf-parse` and fails the build if any ATS-critical string (name, email, section headings, current title, headline stats) isn't extractable text. On Workers Builds, which has no system Chrome, it falls back to `@sparticuz/chromium`.

No phone number is in source. Set `RESUME_PHONE` (Workers Builds env in production, `.env` locally) to add one; leaving it unset omits the line. The contact section in `GithubCard.astro` reads it only in its no-GitHub fallback, which production never renders.
