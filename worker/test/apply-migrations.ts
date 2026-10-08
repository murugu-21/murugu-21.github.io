// Run before every test file: the pool's D1 starts empty, so without the schema
// the fire-and-forget chat mirrors land in a logged .catch(). vitest.config.ts
// inlines the migrations because the pool has no filesystem.
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

declare const __D1_MIGRATIONS__: Parameters<typeof applyD1Migrations>[1];

await applyD1Migrations(env.CHAT_DB, __D1_MIGRATIONS__);
