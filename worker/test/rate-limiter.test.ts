import {env, runInDurableObject} from "cloudflare:test";
import {describe, expect, it} from "vitest";

import {
  NEURON_DAILY_BUDGET,
  NEURONS_PER_M_INPUT_TOKENS,
  NEURONS_PER_M_OUTPUT_TOKENS,
  neuronCost,
  RateLimiter
} from "../rate-limiter";

describe("neuronCost", () => {
  it("converts tokens at the published gpt-oss-120b rates", () => {
    expect(neuronCost(1_000_000, 0)).toBe(NEURONS_PER_M_INPUT_TOKENS);
    expect(neuronCost(0, 1_000_000)).toBe(NEURONS_PER_M_OUTPUT_TOKENS);
    // A typical grounded exchange: ~18k in, ~200 out ≈ 586 neurons.
    expect(neuronCost(18_000, 200)).toBeCloseTo(586.36, 1);
  });
});

describe("RateLimiter", () => {
  it("grants budget until the daily neuron cap is spent", async () => {
    const stub = env.RateLimiter.get(env.RateLimiter.idFromName("test-day"));
    await runInDurableObject(stub, (instance: RateLimiter) => {
      expect(instance.hasBudget()).toBe(true);

      instance.charge(NEURON_DAILY_BUDGET / 2);
      expect(instance.hasBudget()).toBe(true);

      instance.charge(NEURON_DAILY_BUDGET / 2 - 1);
      expect(instance.hasBudget()).toBe(true);

      instance.charge(1);
      expect(instance.hasBudget()).toBe(false);
      expect(instance.spentToday()).toBe(NEURON_DAILY_BUDGET);
    });
  });

  it("ignores invalid charges", async () => {
    const stub = env.RateLimiter.get(env.RateLimiter.idFromName("test-bad"));
    await runInDurableObject(stub, (instance: RateLimiter) => {
      instance.charge(-5);
      instance.charge(NaN);
      instance.charge(Infinity);
      expect(instance.spentToday()).toBe(0);
    });
  });
});
