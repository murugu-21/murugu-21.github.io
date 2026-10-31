import { bindings, defineConfig, exports } from "cf/config";

// oxlint-disable-next-line import/no-relative-parent-imports -- cf resolves the entrypoint as a path from this file, not through package imports
import * as entrypoint from "../src/server.ts" with { type: "cf-worker" };

const NAME = "murugappan-dev-test";

export default defineConfig({
  worker: {
    name: NAME,
    compatibilityDate: "2026-10-01",
    entrypoint,
    env: {
      CHAT_DB: bindings.d1({ name: "jarvis-chats-test", id: "test" }),
      AUDIO: bindings.r2({ name: "murugappan-dev-audio-test" }),
      ChatRoom: bindings.durableObject({ worker: NAME, exportName: "ChatRoom" })
    },
    exports: {
      ChatRoom: exports.durableObject({ storage: "sqlite" }),
      RateLimiter: exports.durableObject({ storage: "sqlite" })
    }
  }
});
