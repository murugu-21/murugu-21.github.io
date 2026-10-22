# Worker

`src/server.ts` is the entry point. `src/app.ts` mounts each module's controller. The [public API](src/modules/api/README.md) and the [MCP server](src/modules/mcp/README.md) have their own READMEs.

Cloudflare serves assets straight from the built site. The Worker only runs for the routes in `run_worker_first` in `wrangler.jsonc`, and for requests that match no file. If you add a route to `app.ts`, add it there too; `test/wrangler.test.ts` fails until you do.

## Markdown pages

The Worker also runs for every page (directory) URL, such as `/about/`. A client whose `Accept` ranks `text/markdown` above HTML gets the page's `index.md`. Everyone else, and every page without an `index.md`, gets the HTML. An HTML page that has an `index.md` names it in a `Link: <…/index.md>; rel="alternate"; type="text/markdown"` header. The Worker checks for that file while it fetches the page, so the check itself adds no wait. Both answers carry `Vary: Accept`. Asset URLs all end in a filename, so they never match `/*/` and never run the Worker first.

## Layers

The Worker uses NestJS's names on top of Hono, with Effect for dependency injection. A file's suffix says its role.

| Suffix                         | Role                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `*.controller.ts`              | A Hono router. It applies guards, pipes and middleware and turns the outcome into a response. When it needs data, it calls a service with `runInRequest`. It never calls a binding itself. |
| `*.service.ts`                 | Business logic, as an Effect `Context.Service`. Its `layer` gets repositories, and integration services such as `MailService`, injected.                                                   |
| `*.repository.ts`              | A `Context.Service` and the only code that reads the records in its store: posts, the dataset, R2 audio, or the contact quota Durable Object.                                              |
| `*.guard.ts`                   | Middleware that decides whether a request may continue, and answers it when not.                                                                                                           |
| `*.interceptor.ts`             | Middleware that wraps `next()` to change every response.                                                                                                                                   |
| `*.pipe.ts`                    | Middleware that parses input into a typed `c.var` value, or answers the error.                                                                                                             |
| `*.middleware.ts`              | Lower-level plumbing: CORS, body limits, 405s.                                                                                                                                             |
| `*.filter.ts`                  | An error handler for a router: what an unhandled error answers.                                                                                                                            |
| `*.tools.ts`, `*.resources.ts` | MCP handlers. They follow the controller rules.                                                                                                                                            |
| `*.store.ts`                   | State held in the isolate's memory and read synchronously, like the per-edge read windows.                                                                                                 |
| `*.client.ts`                  | Code outside Effect that calls a binding or an outside API: the static assets every controller falls back to, and adapters Durable Objects share.                                          |
| `*.durable-object.ts`          | A Durable Object class.                                                                                                                                                                    |
| no suffix                      | Pure functions and constants.                                                                                                                                                              |

Where things go:

- `src/app.module.ts` wires services to repositories and exports `runInRequest`. `src/common/di/` holds the Effect plumbing it uses: the `WorkerEnv` tag and the `Render` type.
- `src/modules/<name>/` holds one feature. A new endpoint goes in its module's controller. An API controller is mounted in `modules/api/api.controller.ts`, which gives it the API's shared stack.
- `src/common/` holds code that isn't one feature's, grouped by role: `interceptors/`, `pipes/`, `middleware/`, `filters/`, `http/` (responses and headers), `di/`, `content.ts` (the bundled site content) and `app-env.ts` (the Hono env types).
- `modules/rate-limit/` owns all rate limiting, as Nest's throttler module does. The read throttle guard counts per edge in `read-quota.store.ts`, synchronously. The contact allowance is global, in the RateLimiter Durable Object behind `contact-quota.repository.ts`.
- `modules/chat/` holds the `ChatRoom` Durable Object and the helpers it calls directly (prompt, frames, page fetching, visitor headers). They don't go through services, and its controller hands `c.env` to the agents SDK's router.
- Repositories wrap the records the API looks up. Documents served whole, such as llms.txt and AGENTS.md, are read straight from `common/content.ts`.
- A unit test sits next to the file it tests. `test/` holds the tests that send a request through the whole Worker, and the fixtures, which unit tests import as `#test/fixtures.ts`.

Services and repositories:

- A controller passes `c.var.services` and a program such as `PostsService.use(posts => posts.findBySlug(slug))` to `runInRequest({ services, program, render })`. `createApp` sets `services` for every request from that request's bindings, because workerd ties a binding's I/O to the request that made it.
- Controllers never call a repository (importing its error and record types is fine), so a service method may just forward to one.
- A repository or integration service that needs a binding reads it from the `WorkerEnv` service in its layer.
- To add one, give it a `static readonly layer` and list it in `app.module.ts`. Each method the layer provides is an `Effect.fn("Service.method")`, so every call gets a span. Lint fails a plain function (`tooling/oxlint/effect.ts`). A service a controller calls goes in `serviceLayers`. A repository, or a service another service depends on, goes in `providerLayers`.
- Failures a caller can act on are `Data.TaggedError`s, declared in the file that raises them. The controller's `render` table has a `success` function and one `failures` entry per tag. The type check fails if an entry is missing or unknown, or if an error's `_tag` is a plain `string`, which `src/common/di/render.test-d.ts` proves.
- Anything else, a defect or a rejected promise, reaches the router's exception filter. Under `/api` and `/openapi.json` that is `common/filters/api-exception.filter.ts`, which logs it and answers the documented JSON 500.
- Only services, repositories, `app.module.ts`, `src/common/di/` and tests may import `effect` values. Lint fails any other value import of it. Type imports are fine.
- Lint enforces each suffix's role (`API_ROLES` in `tooling/lint.config.ts`). Only `app.module.ts` and tests run an Effect. Services and repositories import nothing from Hono or the HTTP layer, log through Effect, and don't swallow defects. Guards, pipes, interceptors, middleware and filters call no service. Controllers, MCP handlers, plumbing, services and repositories don't read `c.env` or call `fetch`. A file with no suffix is pure: it reads no binding, runs no Effect and imports no file that has a suffix (type imports are fine). The one exception is `chat.controller.ts`, the only caller of `routeAgentRequest`, which hands it the bindings with a disable comment saying why.
- Module-scope state lives only in a `*.store.ts`. Anywhere else, a top-level `let` or a mutable `Map` or `Set` fails lint; type a constant one `ReadonlySet` or `ReadonlyMap`.
- Tests replace providers the way Nest's `overrideProvider` does. `appLayer(Layer.succeed(PostsRepository, fake))` is the real graph with one provider faked. A test of an API route sends it through `apiClient({ layer })`, Hono's typed `testClient` over `createApp(layer)`, so a path, query or body the router doesn't accept fails the type check. `fetchWorker(path, { layer })` sends a raw request, for what that client can't express: an unknown path, a wrong method or a malformed body. Fake a repository to test how controllers render its outcomes. Test the repository itself against its binding, as `src/modules/rate-limit/contact-quota.repository.test.ts` does.

## The 404 page

A browser gets the normal 404 page. Anything else, like curl or an AI agent, gets a short markdown guide to the site. Both get a real 404 status.

The Worker also serves `/.well-known/api-catalog` and `/.well-known/mcp.json`, which tell agents where the API and the MCP server are. The documents these, the 404 and the `Link` headers point at come from `packages/contracts/surface.ts`.

## Jarvis

Jarvis is the chat widget on every page. The widget is in `apps/site/src/components/chat/`. Each conversation is a `ChatRoom` Durable Object (`src/modules/chat/chat-room.durable-object.ts`), and replies come from DeepSeek.

To run it locally, put these in `apps/api/.dev.vars`:

```bash
DEEPSEEK_API_KEY=sk-...
# Cloudflare's test secret that accepts every Turnstile token.
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

Then run `bun run build && bun run preview`. A build takes its Turnstile site key from `PUBLIC_TURNSTILE_SITE_KEY`, so put Cloudflare's always-passing visible test key, `PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA`, in `apps/site/.env`. `bun run dev` uses that key when none is set. To see the interactive check, use `3x00000000000000000000FF`, which always asks for a click. Without the DeepSeek key, the chat turns itself off. Local chats call the real API and cost real money.

Things to know:

- After changing `DEEPSEEK_MODEL`, run `bun run test:live` before pushing. It checks that the new model really emails a lead instead of only saying it did.
- The socket opens only for a room name shaped like the widget's (21 characters from nanoid) and an `Origin` on the site itself, or any local page in local dev. CORS doesn't cover WebSockets, so without that check another site's page could spend the chat budget.
- The socket also needs a Turnstile token, which the widget gets from a Turnstile widget and sends as the `cf-turnstile-response` query parameter. `turnstile.guard.ts` checks it with Cloudflare's siteverify and refuses the upgrade with a 403 when the token is missing or rejected, when siteverify can't be reached, or when `TURNSTILE_SECRET_KEY` is unset. A token works once, so every reconnect fetches a new one. The widget renders inside the open chat panel with `appearance: "interaction-only"`, so it shows only when Cloudflare wants a click, with a line saying so. A reconnect while the panel is closed waits for it to reopen. Production needs a Turnstile widget in Managed mode for `murugappan.dev`, its secret as the `TURNSTILE_SECRET_KEY` secret, and its site key as `PUBLIC_TURNSTILE_SITE_KEY` in the production build.
- `ChatRoom` only accepts a small set of message types from the browser.
- Chat stops when the DeepSeek balance runs low. The RateLimiter Durable Object also gives each visitor a bucket of 10 turns that refills one every 5 minutes, and caps the whole site at 400 turns per UTC day (`modules/rate-limit/chat-quota.ts`). A visitor is their IPv4 address or their IPv6 /64 (`visitor-key.ts`), whichever room they chat in. The contact allowance keys on the same visitor. The daily cap bounds spend, but every visitor shares it, so someone with about 40 IPv4 addresses or IPv6 /64s can use it up and turn chat off for everyone until UTC midnight.
- `agents` and `@cloudflare/ai-chat` are pinned to exact versions because minor releases break them. Read their changelogs before upgrading.
- Don't put `OPPORTUNITY_INBOX` in `.dev.vars`. It overrides the real value, and the email binding only sends to that one address.
- The widget downloads on the visitor's first input, so a page that's only loaded never fetches it.
