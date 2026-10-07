/// <reference types="vite/types/import-meta.d.ts" />

// Narrows the Durable Object bindings that .cloudflare/types (from
// cloudflare.config.ts) declares as untyped namespaces, so stubs carry the
// classes' RPC methods.
declare namespace Cloudflare {
  interface Env {
    ChatRoom: DurableObjectNamespace<import("./chat-room").ChatRoom>;
    RateLimiter: DurableObjectNamespace<import("./rate-limiter").RateLimiter>;
  }
}
