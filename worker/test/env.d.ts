declare module "cloudflare:test" {
  import type {RateLimiter} from "../rate-limiter";
  import type {ChatRoom} from "../chat-room";

  export interface ProvidedEnv {
    ChatRoom: DurableObjectNamespace<ChatRoom>;
    RateLimiter: DurableObjectNamespace<RateLimiter>;
  }

  export const env: ProvidedEnv;

  export function runInDurableObject<T>(
    stub: DurableObjectStub<T>,
    fn: (instance: T) => void | Promise<void>
  ): Promise<void>;
}
