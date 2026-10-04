import { bindings, defineConfig, exports } from "cf/config";

// The var and the EMAIL lock both read this, so they can't disagree. The `string`
// annotation stops the generated Env pinning the literal, so tests can override it.
const OPPORTUNITY_INBOX: string = "murugu2001@gmail.com";

// @astrojs/cloudflare builds this Worker during `astro build`; `cf deploy
// --prebuilt` uploads the Build Output it writes to .cloudflare/output.
export default defineConfig({
  worker: {
    name: "murugappan-dev",
    entrypoint: "worker/server.ts",
    // The old Wrangler `v1` migration created both as SQLite-backed classes, and
    // these declarations match the deployed Worker.
    exports: {
      ChatRoom: exports.durableObject({ storage: "sqlite" }),
      RateLimiter: exports.durableObject({ storage: "sqlite" })
    },
    compatibilityDate: "2026-08-01",
    compatibilityFlags: ["nodejs_compat"],
    domains: ["murugappan.dev"],
    // Turns off the *.workers.dev URL so crawlers don't index a second copy of the
    // site. Preview URLs still work.
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
      // Binding by Worker name generates untyped namespaces, which worker/env.d.ts
      // narrows. Binding to the imported class instead makes Env cyclic and types it as {}.
      ChatRoom: bindings.durableObject({ worker: "murugappan-dev", exportName: "ChatRoom" }),
      RateLimiter: bindings.durableObject({ worker: "murugappan-dev", exportName: "RateLimiter" }),
      OPPORTUNITY_INBOX: bindings.text(OPPORTUNITY_INBOX),
      EMAIL: bindings.sendEmail({ destinationAddress: OPPORTUNITY_INBOX }),
      // Deploy fails while it is unset.
      DEEPSEEK_API_KEY: bindings.secret(),
      // A copy of each chat room (messages, country, IP) for browsing chats in the
      // Cloudflare dashboard. ChatRoom's own SQLite stays the source of truth, and
      // replies never wait on these writes. The Worker creates no tables, so run
      // `bun run db:migrate` first, or every write fails with only a
      // "d1 mirror failed" log line.
      CHAT_DB: bindings.d1({ name: "jarvis-chats", id: "a1111792-fb35-470f-85c9-13c3aab0662c" }),
      // Blog audio. `bun run audio` uploads it from a local machine, and
      // worker/audio.ts serves it.
      AUDIO: bindings.r2({ name: "murugappan-dev-audio" })
    }
  }
});
