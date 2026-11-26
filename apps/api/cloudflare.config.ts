import { bindings, defineConfig, exports, triggers } from "cf/config";

import * as entrypoint from "./src/server.ts" with { type: "cf-worker" };

const NAME = "murugappan-dev";
const INBOX = "murugu2001@gmail.com";

export default defineConfig({
  worker: {
    name: NAME,
    // Dates from 2026-08-04 turn nodejs_compat on, which `agents` needs (node:crypto,
    // node:async_hooks). An earlier date needs the flag set here.
    compatibilityDate: "2026-10-01",
    entrypoint,
    domains: ["murugappan.dev"],
    workersDev: false,
    previewUrls: true,
    triggers: [triggers.scheduled({ schedule: "0 3 * * *" })],
    observability: {
      enabled: true,
      // Spans count toward the Workers Logs event quota, so trace a sample.
      traces: { enabled: true, headSamplingRate: 0.2 }
    },
    assets: {
      notFoundHandling: "none",
      runWorkerFirst: [
        "/",
        "/*/",
        "/api/*",
        "/openapi.json",
        "/mcp",
        "/mcp/*",
        "/mcp.json",
        "/.well-known/*",
        "/agents/*",
        "/blog/audio/*"
      ]
    },
    env: {
      OPPORTUNITY_INBOX: bindings.text<string>(INBOX),
      EMAIL: bindings.sendEmail({ destinationAddress: INBOX }),
      DEEPSEEK_API_KEY: bindings.secret(),
      POSTHOG_PROJECT_TOKEN: bindings.secret(),
      TURNSTILE_SECRET_KEY: bindings.secret(),
      CHAT_DB: bindings.d1({ name: "jarvis-chats", id: "a1111792-fb35-470f-85c9-13c3aab0662c" }),
      AUDIO: bindings.r2({ name: "murugappan-dev-audio" }),
      // The agents SDK routes /agents/* by finding the room's namespace in env.
      ChatRoom: bindings.durableObject({ worker: NAME, exportName: "ChatRoom" }),
      ASSETS: bindings.assets()
    },
    exports: {
      ChatRoom: exports.durableObject({ storage: "sqlite" }),
      RateLimiter: exports.durableObject({ storage: "sqlite" })
    }
  }
});
