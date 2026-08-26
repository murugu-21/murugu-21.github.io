import {env, runInDurableObject} from "cloudflare:test";
import {describe, expect, it} from "vitest";

import {CONTACT_DAILY_GLOBAL, CONTACT_DAILY_PER_CLIENT} from "../api/contact";
import {BALANCE_RESERVE_USD, RateLimiter} from "../rate-limiter";

function balanceResponse(
  body: unknown,
  status = 200
): {fetcher: typeof fetch; calls: () => number} {
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return new Response(JSON.stringify(body), {status});
  }) as typeof fetch;
  return {fetcher, calls: () => calls};
}

const HEALTHY = {
  is_available: true,
  balance_infos: [{currency: "USD", total_balance: "1.99"}]
};

describe("chatAvailable", () => {
  it("allows chat on a funded account and caches the reading", async () => {
    const stub = env.RateLimiter.get(env.RateLimiter.idFromName("bal-ok"));
    const {fetcher, calls} = balanceResponse(HEALTHY);
    await runInDurableObject(stub, async (instance: RateLimiter) => {
      expect(await instance.chatAvailable("sk-test", fetcher)).toBe(true);
      // Second call inside the TTL must not cost another round-trip: every
      // room shares this instance, so N conversations = 1 balance check.
      expect(await instance.chatAvailable("sk-test", fetcher)).toBe(true);
      expect(calls()).toBe(1);
    });
  });

  it("gates once the balance is down to the reserve", async () => {
    const stub = env.RateLimiter.get(env.RateLimiter.idFromName("bal-low"));
    const {fetcher} = balanceResponse({
      is_available: true,
      balance_infos: [
        {currency: "USD", total_balance: String(BALANCE_RESERVE_USD)}
      ]
    });
    await runInDurableObject(stub, async (instance: RateLimiter) => {
      expect(await instance.chatAvailable("sk-test", fetcher)).toBe(false);
    });
  });

  it("gates when DeepSeek reports the account unavailable", async () => {
    const stub = env.RateLimiter.get(env.RateLimiter.idFromName("bal-unavail"));
    const {fetcher} = balanceResponse({
      is_available: false,
      balance_infos: [{currency: "USD", total_balance: "10.00"}]
    });
    await runInDurableObject(stub, async (instance: RateLimiter) => {
      expect(await instance.chatAvailable("sk-test", fetcher)).toBe(false);
    });
  });

  it("reads the USD row, ignoring other currencies", async () => {
    const stub = env.RateLimiter.get(env.RateLimiter.idFromName("bal-cny"));
    const {fetcher} = balanceResponse({
      is_available: true,
      balance_infos: [
        {currency: "CNY", total_balance: "0.00"},
        {currency: "USD", total_balance: "1.99"}
      ]
    });
    await runInDurableObject(stub, async (instance: RateLimiter) => {
      expect(await instance.chatAvailable("sk-test", fetcher)).toBe(true);
    });
  });

  // The balance endpoint being unreachable is no reason to take the widget
  // down — a truly empty account is caught by the 402 on the next exchange.
  it("fails open when the balance lookup errors", async () => {
    const stub = env.RateLimiter.get(env.RateLimiter.idFromName("bal-err"));
    const {fetcher} = balanceResponse({}, 500);
    await runInDurableObject(stub, async (instance: RateLimiter) => {
      expect(await instance.chatAvailable("sk-test", fetcher)).toBe(true);
    });
  });

  it("gates every room immediately once DeepSeek reports a 402", async () => {
    const stub = env.RateLimiter.get(env.RateLimiter.idFromName("bal-402"));
    const {fetcher, calls} = balanceResponse(HEALTHY);
    await runInDurableObject(stub, async (instance: RateLimiter) => {
      expect(await instance.chatAvailable("sk-test", fetcher)).toBe(true);
      await instance.markChatExhausted();
      // Gated without re-asking DeepSeek — the 402 already settled it.
      expect(await instance.chatAvailable("sk-test", fetcher)).toBe(false);
      expect(calls()).toBe(1);
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
