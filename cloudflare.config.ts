import { bindings, defineConfig, exports } from "cf/config";

// One value for the var and the EMAIL lock, so they can't disagree. Typed `string`
// so the generated Env doesn't pin the literal and tests can override it.
const OPPORTUNITY_INBOX: string = "murugu2001@gmail.com";

// @astrojs/cloudflare builds this Worker during `astro build`; `cf deploy
// --prebuilt` uploads the Build Output it writes to .cloudflare/output.
export default defineConfig({
  worker: {
    name: "murugappan-dev",
    entrypoint: "worker/server.ts",
    // The old Wrangler `v1` migration created both as SQLite-backed classes;
    // these declarations match that live state.
    exports: {
      ChatRoom: exports.durableObject({ storage: "sqlite" }),
      RateLimiter: exports.durableObject({ storage: "sqlite" })
    },
    compatibilityDate: "2026-08-01",
    compatibilityFlags: ["nodejs_compat"],
    domains: ["murugappan.dev"],
    // no *.workers.dev duplicate for crawlers (preview URLs unaffected)
    workersDev: false,
    observability: { enabled: true },
    assets: {
      // Misses go to the Worker so worker/not-found.ts can content-negotiate the
      // 404; "404-page" would answer every miss with 404.html.
      notFoundHandling: "none",
      // Routes the Worker must answer even where an asset would win (JSON errors
      // for /api/*, host-aware generated docs). Keep in sync with worker/server.ts.
      runWorkerFirst: [
        "/api/*",
        "/openapi.json",
        "/mcp",
        "/mcp/*",
        "/mcp.json",
        "/.well-known/*",
        "/parties/*",
        "/blog/audio/*"
      ]
    },
    env: {
      ASSETS: bindings.assets(),
      // Bound by Worker name, which types them as untyped namespaces; worker/env.d.ts
      // narrows them. Binding to the imported class instead makes Env cyclic ({}).
      ChatRoom: bindings.durableObject({ worker: "murugappan-dev", exportName: "ChatRoom" }),
      RateLimiter: bindings.durableObject({ worker: "murugappan-dev", exportName: "RateLimiter" }),
      OPPORTUNITY_INBOX: bindings.text(OPPORTUNITY_INBOX),
      EMAIL: bindings.sendEmail({ destinationAddress: OPPORTUNITY_INBOX }),
      // Deploy fails while it is unset.
      DEEPSEEK_API_KEY: bindings.secret(),
      // Fire-and-forget analytics mirror of chat rooms (messages, country, IP) so
      // chats are browsable in the dash; DO SQLite is the source of truth.
      // The Worker issues no DDL: run `bun run db:migrate`, or every mirror write
      // fails with only a "d1 mirror failed" log line.
      CHAT_DB: bindings.d1({ name: "jarvis-chats", id: "a1111792-fb35-470f-85c9-13c3aab0662c" }),
      // Blog audio, written locally by `bun run audio`; served by worker/audio.ts.
      AUDIO: bindings.r2({ name: "murugappan-dev-audio" })
    }
  }
});
