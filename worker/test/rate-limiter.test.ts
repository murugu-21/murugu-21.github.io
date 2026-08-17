import {env, runInDurableObject} from "cloudflare:test";
import {describe, expect, it} from "vitest";

import {MODEL_ID} from "../prompt";
import {
  MODEL_NEURON_RATES,
  NEURON_DAILY_BUDGET,
  neuronCost,
  RateLimiter
} from "../rate-limiter";

describe("neuronCost", () => {
  it("has rates for the active model", () => {
    expect(MODEL_NEURON_RATES[MODEL_ID]).toBeDefined();
  });

  it("converts tokens at the model's published rates", () => {
    const rates = MODEL_NEURON_RATES[MODEL_ID];
    expect(neuronCost(MODEL_ID, 1_000_000, 0)).toBe(rates.inputPerM);
    expect(neuronCost(MODEL_ID, 0, 1_000_000)).toBe(rates.outputPerM);
    // A typical grounded exchange on qwen3-30b-a3b: ~18k in, ~200 out.
    expect(neuronCost("@cf/qwen/qwen3-30b-a3b-fp8", 18_000, 200)).toBeCloseTo(
      89.3,
      1
    );
  });

  it("falls back to the most expensive known rates for unknown models", () => {
    const worst = Math.max(
      ...Object.values(MODEL_NEURON_RATES).map(r => r.inputPerM)
    );
    expect(neuronCost("@cf/unknown/model", 1_000_000, 0)).toBe(worst);
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
