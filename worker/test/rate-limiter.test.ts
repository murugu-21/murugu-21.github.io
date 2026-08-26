import {env, runInDurableObject} from "cloudflare:test";
import {describe, expect, it} from "vitest";

import {CONTACT_DAILY_GLOBAL, CONTACT_DAILY_PER_CLIENT} from "../api/contact";
import {
  CHAT_DAILY_BUDGET_USD,
  DEEPSEEK_RATES,
  exchangeCost,
  RateLimiter
} from "../rate-limiter";

describe("exchangeCost", () => {
  it("converts tokens at DeepSeek's published rates", () => {
    expect(exchangeCost(1_000_000, 0)).toBeCloseTo(DEEPSEEK_RATES.inputPerM, 6);
    expect(exchangeCost(0, 1_000_000)).toBeCloseTo(
      DEEPSEEK_RATES.outputPerM,
      6
    );
  });

  // The shape CHAT_DAILY_BUDGET_USD is sized against, measured against the
  // live API: ~3.6k grounded prompt tokens and a ~150-token reply. If these
  // move, the "~170 turns a day" in rate-limiter.ts is stale.
  it("prices a measured grounded exchange at about a fifth of a cent", () => {
    expect(exchangeCost(3_650, 150)).toBeCloseTo(0.0018, 4);
  });

  it("keeps the daily budget worth at least ~150 turns", () => {
    const perTurn = 0.003; // measured average; a turn is 1-3 exchanges
    expect(CHAT_DAILY_BUDGET_USD / perTurn).toBeGreaterThan(150);
  });
});

describe("RateLimiter", () => {
  it("grants budget until the daily spend cap is reached", async () => {
    const stub = env.RateLimiter.get(env.RateLimiter.idFromName("test-day"));
    await runInDurableObject(stub, (instance: RateLimiter) => {
      expect(instance.hasBudget()).toBe(true);

      instance.charge(CHAT_DAILY_BUDGET_USD / 2);
      expect(instance.hasBudget()).toBe(true);

      instance.charge(CHAT_DAILY_BUDGET_USD / 2 - 0.01);
      expect(instance.hasBudget()).toBe(true);

      instance.charge(0.01);
      expect(instance.hasBudget()).toBe(false);
      expect(instance.spentToday()).toBeCloseTo(CHAT_DAILY_BUDGET_USD, 6);
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

describe("contact slots", () => {
  function limiter(name: string) {
    return env.RateLimiter.get(env.RateLimiter.idFromName(name));
  }

  it("allows the first request from a client and reports what is left", async () => {
    expect(await limiter("contact-a").takeContactSlot("1.1.1.1")).toEqual({
      allowed: true,
      clientRemaining: CONTACT_DAILY_PER_CLIENT - 1,
      globalRemaining: CONTACT_DAILY_GLOBAL - 1
    });
  });

  it("blocks a client once its daily allowance is spent", async () => {
    const stub = limiter("contact-b");
    for (let i = 0; i < CONTACT_DAILY_PER_CLIENT; i++) {
      expect(await stub.takeContactSlot("2.2.2.2")).toMatchObject({
        allowed: true,
        clientRemaining: CONTACT_DAILY_PER_CLIENT - i - 1
      });
    }
    expect(await stub.takeContactSlot("2.2.2.2")).toEqual({
      allowed: false,
      scope: "client",
      clientRemaining: 0,
      globalRemaining: CONTACT_DAILY_GLOBAL - CONTACT_DAILY_PER_CLIENT
    });
  });

  it("counts each client separately", async () => {
    const stub = limiter("contact-c");
    for (let i = 0; i < CONTACT_DAILY_PER_CLIENT; i++) {
      await stub.takeContactSlot("3.3.3.3");
    }
    expect(await stub.takeContactSlot("4.4.4.4")).toMatchObject({
      allowed: true,
      clientRemaining: CONTACT_DAILY_PER_CLIENT - 1
    });
  });

  it("blocks every client once the site-wide daily allowance is spent", async () => {
    const stub = limiter("contact-d");
    let sent = 0;
    for (let client = 0; sent < CONTACT_DAILY_GLOBAL; client++) {
      for (let i = 0; i < CONTACT_DAILY_PER_CLIENT; i++) {
        const result = await stub.takeContactSlot(`10.0.0.${client}`);
        if (!result.allowed) break;
        sent++;
      }
    }
    expect(sent).toBe(CONTACT_DAILY_GLOBAL);
    expect(await stub.takeContactSlot("10.0.9.9")).toEqual({
      allowed: false,
      scope: "global",
      clientRemaining: CONTACT_DAILY_PER_CLIENT,
      globalRemaining: 0
    });
  });

  it("does not charge the global counter for a client-blocked request", async () => {
    const stub = limiter("contact-e");
    for (let i = 0; i < CONTACT_DAILY_PER_CLIENT + 2; i++) {
      await stub.takeContactSlot("5.5.5.5");
    }
    expect(await stub.contactsSentToday()).toBe(CONTACT_DAILY_PER_CLIENT);
  });

  it("reports the remaining allowance without spending any of it", async () => {
    const stub = limiter("contact-f");
    expect(await stub.contactUsage("6.6.6.6")).toEqual({
      clientRemaining: CONTACT_DAILY_PER_CLIENT,
      globalRemaining: CONTACT_DAILY_GLOBAL
    });
    await stub.takeContactSlot("6.6.6.6");
    expect(await stub.contactUsage("6.6.6.6")).toEqual({
      clientRemaining: CONTACT_DAILY_PER_CLIENT - 1,
      globalRemaining: CONTACT_DAILY_GLOBAL - 1
    });
    // Another client shares the site-wide tier but has its own.
    expect(await stub.contactUsage("7.7.7.7")).toEqual({
      clientRemaining: CONTACT_DAILY_PER_CLIENT,
      globalRemaining: CONTACT_DAILY_GLOBAL - 1
    });
    expect(await stub.contactsSentToday()).toBe(1);
  });
});
