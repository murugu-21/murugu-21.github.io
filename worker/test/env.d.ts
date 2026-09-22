declare module "cloudflare:test" {
  import type { RateLimiter } from "../rate-limiter";
  import type { ChatRoom } from "../chat-room";

  export interface ProvidedEnv {
    ChatRoom: DurableObjectNamespace<ChatRoom>;
    RateLimiter: DurableObjectNamespace<RateLimiter>;
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

  export function runInDurableObject<T>(
    stub: DurableObjectStub<T>,
    fn: (instance: T) => void | Promise<void>
  ): Promise<void>;
}
