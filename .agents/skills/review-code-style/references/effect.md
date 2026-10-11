# Effect 4

The Worker uses Effect for dependency injection only in services, repositories and the wiring. `apps/api/README.md` › Layers describes the graph. `node_modules/effect/AGENTS.md` is Effect's own guide for agents, and it matches the installed version.

**Lint covers.** `effect/use-fn` (every method in the object a `Layer.effect`, `Layer.succeed` or `Layer.sync` provides is `Effect.fn("Service.method")` or `Effect.fnUntraced`). It misses a layer built with `.pipe(...)` and methods declared as a local `const` and returned, so check those by hand. `Effect.run*` only in `app.module.ts`. No defect-swallowing combinators (`catchCause`, `catchDefect`, `ignore`, `orElseSucceed`, `sandbox`, `orDie`, `Effect.catch`) and no `Effect.promise` in services or repositories without a reasoned disable. No `console` in services or repositories. `bun run check:effect` (`@effect/tsgo`) catches floating Effects, a `yield` without `*`, requirement leaks, an Effect run inside an Effect, and providing twice. The `render` table's type check (`apps/api/src/common/di/render.test-d.ts`) catches an unhandled or unknown error tag.

Rules lint can't check:

- **EFFECT-1.** A service is `Context.Service<Self, Shape>()(id)` with a `static readonly layer`, listed in `app.module.ts`: services a controller calls in `serviceLayers`, repositories and integration services in `providerLayers`.
- **EFFECT-2.** Inside a service, depend on another service with `yield* Service` in its layer. `Service.use(...)` belongs in controllers, tools and resources only, where it is the edge.
- **EFFECT-3.** A failure a caller can act on is a `Data.TaggedError` with a literal `_tag`, declared in the file that raises it, with a `render` entry in every controller that runs the program.
- **EFFECT-4.** Use `Effect.tryPromise` with a tagged error for a promise whose rejection a caller can act on. `Effect.promise` is only for rejections that are bugs, and its disable comment says so.
- **EFFECT-5.** Handle typed failures with `catchTag` or `catchTags`, so a new tag becomes a compile error. Let defects reach the exception filter.
- **EFFECT-6.** Don't throw inside `Effect.map`, `Effect.sync` or a generator. Use `Effect.try`, or `return yield* new SomeError()`.
- **EFFECT-7.** Prefer `Effect.filterOrFail` to a `flatMap` that returns `succeed` or `fail`, and `Effect.match` to `matchEffect` with `Effect.sync` branches.
- **EFFECT-8.** Never create a module-level `ManagedRuntime`, memo map or cached layer over anything that reads `WorkerEnv`. Bindings belong to one request, and `runInRequest` relies on a fresh memo map per run.
- **EFFECT-9.** Don't `Layer.mergeAll` two layers when one needs the other. Provide the dependency.
- **EFFECT-10.** A layer that acquires a resource (a socket, a stream, a lock) uses `Effect.acquireRelease` inside `Layer.effect`. v4 has no `Layer.scoped`.
- **EFFECT-11.** Log from services with `Effect.log` and `Effect.annotateLogs`, so the log carries the span.

Sources: https://effect.website/blog/releases/effect/40, https://effect.website/docs/v4/requirements-management/services/, https://effect.website/docs/v4/error-management/unexpected-errors/, https://effect.website/docs/v4/code-style/guidelines/, https://github.com/Effect-TS/effect-smol/blob/main/MIGRATION.md, https://github.com/Effect-TS/tsgo.
