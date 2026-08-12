import {env, runInDurableObject} from "cloudflare:test";
import {describe, expect, it} from "vitest";

import {GLOBAL_DAILY_LIMIT, RateLimiter} from "../rate-limiter";

describe("RateLimiter", () => {
  it("allows messages under the daily cap and blocks at the cap", async () => {
    const stub = env.RateLimiter.get(env.RateLimiter.idFromName("test-day"));
    await runInDurableObject(stub, (instance: RateLimiter) => {
      for (let i = 0; i < GLOBAL_DAILY_LIMIT; i++) {
        expect(instance.consume()).toBe(true);
      }
      expect(instance.consume()).toBe(false);
      expect(instance.consume()).toBe(false);
    });
  });
});
