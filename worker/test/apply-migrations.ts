// Applied by vitest.config.ts to every test file. The pool's D1 starts empty
// and the chat mirrors are fire-and-forget, so without the real schema their
// writes land in a logged .catch() instead of a table. The migrations are
// inlined by the config because the pool has no filesystem to read them.
import { applyD1Migrations, env } from "cloudflare:test";

declare const __D1_MIGRATIONS__: Parameters<typeof applyD1Migrations>[1];

await applyD1Migrations(env.CHAT_DB, __D1_MIGRATIONS__);
