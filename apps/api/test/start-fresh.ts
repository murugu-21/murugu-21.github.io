// Runs before each test file. With isolate: false the files on a pool worker share its storage
// and loaded modules, so this wipes both, along with any stub or spy a previous file left.
import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { vi } from "vite-plus/test";

// The root vite.config.ts inlines the migrations because the pool has no filesystem.
declare const __D1_MIGRATIONS__: Parameters<typeof applyD1Migrations>[1];

// The workers/store-exports-reset lint rule makes every store export resetStore.
const storeResets = import.meta.glob<() => void>("../src/**/*.store.ts", {
  eager: true,
  import: "resetStore"
});

vi.restoreAllMocks();
vi.unstubAllGlobals();
vi.unstubAllEnvs();
vi.useRealTimers();
await reset();
for (const resetStore of Object.values(storeResets)) resetStore();
await applyD1Migrations(env.CHAT_DB, __D1_MIGRATIONS__);
