# Hono, the NestJS roles, and zod at boundaries

The Worker uses NestJS role names on top of Hono. `apps/api/README.md` › Layers defines each suffix. Read it first.

**Lint covers.** Per-suffix import and property bans in `tooling/lint.config.ts`. A controller, tool or resource can't import a repository, a Durable Object, `worker-env` or a value `Context` from `hono`. Plumbing (guards, pipes, interceptors, middleware, filters) can't import services or `app.module.ts`. Services, repositories, controllers, tools, resources and plumbing can't read `c.env`. Lint doesn't check `app.ts`, `common/http/`, stores or Durable Objects, so check `c.env` there by hand: only `*.client.ts` reads bindings. Only services, repositories, `app.module.ts`, `common/di/` and tests import `effect` values. `routeAgentRequest` is called only from `chat.controller.ts`. `no-floating-promises` catches an un-awaited `next()`. `typescript/no-deprecated` catches zod 3 APIs.

Rules lint can't check:

- **HONO-1.** Write handlers inline in the route call, so Hono infers params and `c.var`. Don't pull `(c) => …` helpers out of a controller. If one is unavoidable, build it with `defineHandler()` from `hono/factory` or move it to a `*.client.ts`.
- **HONO-2.** Read request input only through the pipes (`jsonBodyPipe`, `queryPipe`) and then `c.var.body` or `c.var.query`. Never parse `c.req` in a handler. Hono's own `validator` hands `{}` to the schema when `Content-Type` is wrong, which is why the pipes exist.
- **HONO-3.** Register read routes with `.get()`. Hono already answers `HEAD` from the `GET` route, so a `"HEAD"` in `.on([...])` registers a route that never runs.
- **HONO-4.** Mount a new router in `app.ts` before any broader prefix that would swallow it, and add its path to `assets.runWorkerFirst` in `apps/api/cloudflare.config.ts`, or static assets answer it.
- **HONO-5.** Put an API endpoint under `apiController` (`modules/api/api.controller.ts`), so the filter, CORS, throttle, headers interceptor and 405s apply. Don't install that stack a second time.
- **HONO-6.** Answer expected outcomes from the controller's `render` table. Throw only for bugs. The API's error shape is `apiError`, not a thrown `HTTPException`.
- **HONO-7.** A guard is a yes or no gate that answers when it refuses. A pipe parses into `c.var` or answers a 4xx. An interceptor wraps `next()` and edits headers. None of them calls a service or runs an Effect.
- **HONO-8.** An interceptor edits headers only on a response the Worker built. Copy a binding's response with `new Response(body, res)` before you change it.
- **HONO-9.** Type the Hono env through the generics in `common/app-env.ts`. Never augment `ContextVariableMap` globally.
- **HONO-10.** The exception filter is the last resort. It logs the cause and keeps it out of the response body.

zod at boundaries:

- **ZOD-1.** Shared request and response shapes live in `packages/contracts`, which holds only shapes (`contracts/shapes-only`).
- **ZOD-2.** Use `safeParse` at HTTP and storage boundaries and map a failure to a 4xx or a typed error. Use `parse` only where a failure means a bug or a broken build.
- **ZOD-3.** Choose `z.strictObject` or `z.looseObject` on purpose for outside payloads. Avoid the legacy `.strict()`, `.strip()` and `z.formatError()`, which lint doesn't flag.
- **ZOD-4.** Validate with zod, not `effect/Schema`. The contracts are shared with the Astro site.
- **ZOD-5.** Every string from outside has a maximum length.

Sources: https://hono.dev/docs/guides/best-practices, https://hono.dev/docs/guides/validation, https://hono.dev/docs/api/exception, https://hono.dev/docs/helpers/factory, https://hono.dev/docs/guides/middleware, https://docs.nestjs.com/guards, https://docs.nestjs.com/pipes, https://docs.nestjs.com/interceptors, https://docs.nestjs.com/exception-filters, https://zod.dev/basics, https://zod.dev/api, https://zod.dev/v4/changelog.
