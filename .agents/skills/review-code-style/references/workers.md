# Cloudflare Workers, Durable Objects, the agents SDK, D1 and R2

**Lint covers.** Floating promises, including `void promise` in `apps/api` (`typescript/no-floating-promises` with `ignoreVoid: false`), a destructured `ctx.waitUntil` (`typescript/unbound-method`), `Math.random` and `passThroughOnException` in `apps/api`, timers in `*.durable-object.ts`, explicit `public` on every Durable Object member, top-level `let`, `var` and mutable `Map` or `Set` outside `*.store.ts` (`workers/no-module-state`, which skips array and object literals), interpolated SQL (`workers/sql-bindings`), untyped JSON and storage reads (`no-unsafe-*`), and the `promise/*` hygiene rules. `bun run types` generates `Env` from `apps/api/cloudflare.config.ts`, and pre-push runs it first.

Workers:

- **CF-1.** Keep no request, `env`, binding, stub or per-request value at module scope. A per-isolate cache goes only in a `*.store.ts`, with a size bound and a comment saying it is per edge.
- **CF-2.** Send fire-and-forget work through `ctx.waitUntil` (`this.ctx.waitUntil` in a Durable Object) with its own `.catch`.
- **CF-3.** Stream R2 and asset bodies through to the `Response`. Cap any request body the Worker reads whole with `bodyLimitMiddleware`.
- **CF-4.** Log one object per call with an `event` field, for example `console.error({ event: "contact email failed", err })`. Workers Logs indexes object fields, not text inside a message. Never log secrets, API keys, visitor IPs or a lead's contact details.
- **CF-5.** Read secrets only from `env`, each declared as `bindings.secret()` in `apps/api/cloudflare.config.ts`. Never put a secret in `bindings.text()`. Run `bun run types` after any `cloudflare.config.ts` change.
- **CF-6.** When the diff bumps `compatibility_date`, it names which flags between the old and new dates affect the Worker.
- **CF-7.** `apps/api/test/wrangler.jsonc` matches `apps/api/cloudflare.config.ts` in date, Durable Object bindings and `exports`; `apps/api/test/wrangler.test.ts` enforces it.
- **CF-8.** Compare secrets or tokens with `crypto.subtle.timingSafeEqual` over fixed-length digests.

Durable Objects:

- **DO-1.** Keep a read-check-write path synchronous (`sql.exec`, `ctx.storage.kv`), so the input gate makes it atomic. Don't make `takeContactSlot` async.
- **DO-2.** After any `await` of non-storage I/O inside a Durable Object (fetch, RPC, email, D1), re-read state before writing, as `RateLimiter.chatFunded` does, or claim first and roll back on failure, as `emailLeadOnce` does.
- **DO-3.** Use `blockConcurrencyWhile` only in a constructor, inside try/catch, with no I/O.
- **DO-4.** Change a table only through a versioned migration. `CREATE TABLE IF NOT EXISTS` never alters an existing table.
- **DO-5.** Index every column a query filters on in each request.
- **DO-6.** Give new per-room data a lifetime: prune it, or expire the room with an idempotent alarm that calls `deleteAll()`.
- **DO-7.** Keep new per-request traffic off the single `"global"` RateLimiter. Shard by key with `idFromName(key)` if a new hot path needs a counter.
- **DO-8.** Every public member is remote API. Helpers are `private`. RPC methods take only serializable inputs and no test-only parameters. Override a protected method in a test subclass instead, as `ChatRoom.languageModel` does.
- **DO-9.** Build a fresh stub for each attempt. Retry only errors marked `.retryable`, only on idempotent calls, with backoff. Never retry `.overloaded`.
- **DO-10.** Prefer the synchronous `ctx.storage.kv` and SQL over the async KV API in SQLite-backed objects. Awaiting `put` turns off write coalescing.

The agents SDK (`ChatRoom`):

- **AGENT-1.** Pass `options.abortSignal` to every `streamText` call in `onChatMessage`.
- **AGENT-2.** `onChatRecovery` returns `{ continue: false }` unless a retry can't bill twice. Trim model context (`MAX_HISTORY_MESSAGES`) separately from `maxPersistedMessages`.
- **AGENT-3.** Validate the room name and the `Upgrade` header in the Worker before routing to the object. Each new name creates a billed Durable Object.
- **AGENT-4.** `agents` and `@cloudflare/ai-chat` are pinned. A bump says which changelog entries it read (apps/api/README.md › Jarvis).

D1 and R2:

- **D1-1.** Bind every value with `?` and `.bind()`. Use `batch()` when several statements must commit together. Never `exec()` a string with input in it.
- **D1-2.** D1 mirror writes stay fire-and-forget and constraint-free. The Durable Object's SQLite is the source of truth.

Sources: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/, https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/, https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/, https://developers.cloudflare.com/durable-objects/best-practices/websockets/, https://developers.cloudflare.com/durable-objects/best-practices/error-handling/, https://developers.cloudflare.com/agents/api-reference/chat-agents/, https://developers.cloudflare.com/agents/api-reference/routing/, https://developers.cloudflare.com/d1/worker-api/d1-database/, https://developers.cloudflare.com/workers/observability/logs/workers-logs/.
