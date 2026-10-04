// Inline import() types: tsgolint (type-aware lint) leaves `import type` inside this block unresolved.
declare module "cloudflare:test" {
  export interface ProvidedEnv {
    ChatRoom: DurableObjectNamespace<import("#worker/chat-room.ts").ChatRoom>;
    RateLimiter: DurableObjectNamespace<import("#worker/rate-limiter.ts").RateLimiter>;
    AUDIO: R2Bucket;
    CHAT_DB: D1Database;
  }

  export const env: ProvidedEnv;

  export interface D1Migration {
    name: string;
    queries: string[];
  }

  export function applyD1Migrations(
    db: D1Database,
    migrations: D1Migration[],
    migrationsTableName?: string
  ): Promise<void>;

  export function runInDurableObject<T, R>(
    stub: DurableObjectStub<T>,
    fn: (instance: T) => R | Promise<R>
  ): Promise<R>;
}
