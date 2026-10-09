import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  CONTACT_DAILY_GLOBAL,
  CONTACT_DAILY_PER_CLIENT
} from "@murugappan/contracts/api/contact.ts";
import { BALANCE_RESERVE_USD, RateLimiter } from "#src/rate-limiter.ts";

/** Runs inside the instance, so the synchronous contact methods skip an RPC per call. */
function inLimiter(name: string, fn: (instance: RateLimiter) => Promise<void> | void) {
  const stub = env.RateLimiter.get(env.RateLimiter.idFromName(name));
  return runInDurableObject(stub, fn);
}

function balanceResponse(body: unknown, status = 200): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

const usd = (total: number | string, available = true) => ({
  is_available: available,
  balance_infos: [{ currency: "USD", total_balance: String(total) }]
});

describe("chatAvailable", () => {
  it("allows chat on a funded account and caches the reading", async () => {
    await inLimiter("bal-ok", async instance => {
      expect(await instance.chatAvailable("sk-test", balanceResponse(usd("1.99")))).toBe(true);
      // Every room shares this instance, so N conversations cost one balance check.
      // The second answer comes from the cache, not this empty account.
      expect(await instance.chatAvailable("sk-test", balanceResponse(usd("0", false)))).toBe(true);
    });
  });

  // A failed lookup fails open: a truly empty account is caught by the 402 on
  // the next exchange, so an unreachable balance endpoint must not take the
  // widget down.
  it.each([
    {
      label: "gates once the balance is down to the reserve",
      body: usd(BALANCE_RESERVE_USD),
      status: 200,
      expected: false
    },
    {
      label: "gates when DeepSeek reports the account unavailable",
      body: usd("10.00", false),
      status: 200,
      expected: false
    },
    { label: "fails open when the balance lookup errors", body: {}, status: 500, expected: true }
  ])("$label", async ({ label, body, status, expected }) => {
    await inLimiter(`bal-${label}`, async instance => {
      expect(await instance.chatAvailable("sk-test", balanceResponse(body, status))).toBe(expected);
    });
  });

  it("gates every room immediately once DeepSeek reports a 402", async () => {
    const funded = balanceResponse(usd("1.99"));
    await inLimiter("bal-402", async instance => {
      expect(await instance.chatAvailable("sk-test", funded)).toBe(true);
      await instance.markChatExhausted();
      // Gated even though the balance still reads funded: the 402 settled it.
      expect(await instance.chatAvailable("sk-test", funded)).toBe(false);
    });
  });

  it("keeps a 402 that lands while a balance check is still fetching", async () => {
    let answer: (response: Response) => void = () => {};
    const reading = new Promise<Response>(resolve => (answer = resolve));
    await inLimiter("bal-race", async instance => {
      const checking = instance.chatAvailable("sk-test", () => reading);
      await instance.markChatExhausted();
      answer(new Response(JSON.stringify(usd("1.99"))));
      await checking;
      expect(await instance.chatAvailable("sk-test", balanceResponse(usd("1.99")))).toBe(false);
    });
  });
});

describe("contact slots", () => {
  it("allows a client its daily allowance, then blocks it", async () => {
    await inLimiter("contact-client", instance => {
      for (let i = 0; i < CONTACT_DAILY_PER_CLIENT; i++) {
        expect(instance.takeContactSlot("2.2.2.2")).toEqual({
          allowed: true,
          clientRemaining: 2 - i,
          globalRemaining: 19 - i
        });
      }
      expect(instance.takeContactSlot("2.2.2.2")).toEqual({
        allowed: false,
        scope: "client",
        clientRemaining: 0,
        globalRemaining: 17
      });
    });
  });

  it("blocks every client once the site-wide daily allowance is spent", async () => {
    await inLimiter("contact-global", instance => {
      let sent = 0;
      for (let client = 0; sent < CONTACT_DAILY_GLOBAL; client++) {
        for (let i = 0; i < CONTACT_DAILY_PER_CLIENT; i++) {
          if (!instance.takeContactSlot(`10.0.0.${client}`).allowed) break;
          sent++;
        }
      }
      expect(sent).toBe(20);
      expect(instance.takeContactSlot("10.0.9.9")).toEqual({
        allowed: false,
        scope: "global",
        clientRemaining: 3,
        globalRemaining: 0
      });
    });
  });

  it("does not charge the global counter for a client-blocked request", async () => {
    await inLimiter("contact-no-charge", instance => {
      for (let i = 0; i < CONTACT_DAILY_PER_CLIENT + 2; i++) instance.takeContactSlot("5.5.5.5");
      expect(instance.contactUsage("5.5.5.5").globalRemaining).toBe(17);
    });
  });

  it("reports the remaining allowance without spending any of it", async () => {
    await inLimiter("contact-usage", instance => {
      expect(instance.contactUsage("6.6.6.6")).toEqual({
        clientRemaining: 3,
        globalRemaining: 20
      });
      instance.takeContactSlot("6.6.6.6");
      expect(instance.contactUsage("6.6.6.6")).toEqual({
        clientRemaining: 2,
        globalRemaining: 19
      });
      // Another client shares the site-wide tier but has its own.
      expect(instance.contactUsage("7.7.7.7")).toEqual({
        clientRemaining: 3,
        globalRemaining: 19
      });
    });
  });
});
