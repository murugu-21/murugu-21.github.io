import { bindings, defineConfig, exports } from "cf/config";

// The production Worker minus what the pool can't reach (ASSETS, EMAIL and
// secrets come from testEnv in fixtures.ts), with its own D1 and R2. Keep the
// Durable Object exports in sync with ../../cloudflare.config.ts; their
// bindings live in vitest.config.ts.
export default defineConfig({
  worker: {
    name: "murugappan-dev-test",
    entrypoint: "../server.ts",
    compatibilityDate: "2026-08-01",
    compatibilityFlags: ["nodejs_compat"],
    exports: {
      ChatRoom: exports.durableObject({ storage: "sqlite" }),
      RateLimiter: exports.durableObject({ storage: "sqlite" })
    },
    env: {
      CHAT_DB: bindings.d1({ name: "jarvis-chats-test", id: "test" }),
      AUDIO: bindings.r2({ name: "murugappan-dev-audio-test" })
    }
  }
});
