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
    // Turns off the *.workers.dev URL so crawlers don't index a second copy of the site, while
    // keeping version preview URLs.
    workersDev: false,
    previewUrls: true,
    triggers: [triggers.scheduled({ schedule: "0 3 * * *" })],
    observability: {
      enabled: true,
      // Spans count toward the Workers Logs event quota, so trace a sample.
      traces: { enabled: true, headSamplingRate: 0.2 }
    },
    assets: {
      // Misses go to the Worker so apps/api/src/modules/pages/assets.client.ts can
      // content-negotiate the 404; "404-page" would answer every miss with 404.html.
      notFoundHandling: "none",
      runWorkerFirst: [
        // Pages, so `Accept: text/markdown` gets their index.md. Every page URL ends in "/" and
        // no asset's does, so assets stay off the Worker.
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
      // `string`, not the literal, so tests can deliver to another inbox.
      OPPORTUNITY_INBOX: bindings.text<string>(INBOX),
      EMAIL: bindings.sendEmail({ destinationAddress: INBOX }),
      DEEPSEEK_API_KEY: bindings.secret(),
      POSTHOG_PROJECT_TOKEN: bindings.secret(),
      TURNSTILE_SECRET_KEY: bindings.secret(),
      // A dashboard mirror of each chat room; ChatRoom's SQLite is the truth. The Worker creates no
      // tables, so without `bun run db:migrate` every write fails as "d1 mirror failed".
      CHAT_DB: bindings.d1({ name: "jarvis-chats", id: "a1111792-fb35-470f-85c9-13c3aab0662c" }),
      AUDIO: bindings.r2({ name: "murugappan-dev-audio" }),
      // The agents SDK routes /agents/* by finding the room's namespace in env. Code that calls
      // a class itself uses the typed `exports` from cloudflare:workers instead.
      ChatRoom: bindings.durableObject({ worker: NAME, exportName: "ChatRoom" }),
      ASSETS: bindings.assets()
    },
    exports: {
      ChatRoom: exports.durableObject({ storage: "sqlite" }),
      RateLimiter: exports.durableObject({ storage: "sqlite" })
    }
  }
});
