import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  CONTACT_DAILY_GLOBAL,
  CONTACT_DAILY_PER_CLIENT
} from "@murugappan/contracts/api/contact.ts";
import {
  BALANCE_RESERVE_USD,
  RateLimiter
} from "#src/modules/rate-limit/rate-limiter.durable-object.ts";
import { visitorKey } from "#src/modules/rate-limit/visitor-key.ts";
import { stubDeepseekBalance } from "#test/fixtures.ts";

function inLimiter(
  name: string,
  fn: (instance: RateLimiter, state: DurableObjectState) => Promise<void> | void
) {
  const stub = env.RateLimiter.get(env.RateLimiter.idFromName(name));
  return runInDurableObject(stub, fn);
}

const usd = (total: number | string, available = true) => ({
  is_available: available,
  balance_infos: [{ currency: "USD", total_balance: String(total) }]
});

const ALLOWED = { allowed: true };
const OVER_BUCKET = { allowed: false, reason: "visitor" };
const OVER_SITE = { allowed: false, reason: "site" };
const UNFUNDED = { allowed: false, reason: "balance" };

const admit = (instance: RateLimiter, ip: string) =>
  instance.admitChatTurn({ visitor: visitorKey(ip), apiKey: "sk-test" });

const repeat = (ip: string, times: number) => Array.from({ length: times }, () => ip);

async function admitAll(instance: RateLimiter, ips: string[]) {
  const outcomes = [];
  for (const ip of ips) outcomes.push(await admit(instance, ip));
  return outcomes;
}

describe("admitChatTurn balance gate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("admits a turn on a funded account and caches the reading", async () => {
    await inLimiter("bal-ok", async instance => {
      stubDeepseekBalance(usd("1.99"));
      expect(await admit(instance, "192.0.2.1")).toEqual(ALLOWED);
      stubDeepseekBalance(usd("0", false));
      expect(await admit(instance, "192.0.2.1")).toEqual(ALLOWED);
    });
  });

  it.each([
    {
      label: "denies once the balance is down to the reserve",
      body: usd(BALANCE_RESERVE_USD),
      status: 200,
      expected: UNFUNDED
    },
    {
      label: "denies when DeepSeek reports the account unavailable",
      body: usd("10.00", false),
      status: 200,
      expected: UNFUNDED
    },
    { label: "fails open when the balance lookup errors", body: {}, status: 500, expected: ALLOWED }
  ])("$label", async ({ label, body, status, expected }) => {
    await inLimiter(`bal-${label}`, async instance => {
      stubDeepseekBalance(body, status);
      expect(await admit(instance, "192.0.2.1")).toEqual(expected);
    });
  });

  it("denies every visitor immediately once DeepSeek reports a 402", async () => {
    stubDeepseekBalance(usd("1.99"));
    await inLimiter("bal-402", async instance => {
      expect(await admit(instance, "192.0.2.1")).toEqual(ALLOWED);
      await instance.markChatExhausted();
      expect(await admit(instance, "192.0.2.2")).toEqual(UNFUNDED);
    });
  });

  it("keeps a 402 that lands while a balance check is still fetching", async () => {
    let answer: (response: Response) => void = () => {};
    const reading = new Promise<Response>(resolve => (answer = resolve));
    await inLimiter("bal-race", async instance => {
      vi.stubGlobal("fetch", () => reading);
      const checking = admit(instance, "192.0.2.1");
      await instance.markChatExhausted();
      answer(new Response(JSON.stringify(usd("1.99"))));
      await checking;
      stubDeepseekBalance(usd("1.99"));
      expect(await admit(instance, "192.0.2.1")).toEqual(UNFUNDED);
    });
  });
});

describe("admitChatTurn quotas", () => {
  beforeEach(() => {
    stubDeepseekBalance(usd("5"));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("gives a visitor ten turns, then one more every five minutes", async () => {
    await inLimiter("bucket-refill", async instance => {
      const spent = await admitAll(instance, repeat("198.51.100.1", 11));
      expect(spent.slice(0, 10)).toEqual(Array.from({ length: 10 }, () => ALLOWED));
      expect(spent[10]).toEqual(OVER_BUCKET);

      vi.setSystemTime(new Date("2026-10-22T12:04:59Z"));
      expect(await admit(instance, "198.51.100.1")).toEqual(OVER_BUCKET);
      vi.setSystemTime(new Date("2026-10-22T12:05:00Z"));
      expect(await admitAll(instance, ["198.51.100.1", "198.51.100.1"])).toEqual([
        ALLOWED,
        OVER_BUCKET
      ]);
    });
  });

  it("spends no token on a turn the balance gate refuses", async () => {
    await inLimiter("bucket-balance", async instance => {
      await admitAll(instance, repeat("198.51.100.3", 9));
      await instance.markChatExhausted();
      expect(await admit(instance, "198.51.100.3")).toEqual(UNFUNDED);

      vi.setSystemTime(new Date("2026-10-22T12:10:00Z"));
      expect(await admitAll(instance, repeat("198.51.100.3", 4))).toEqual([
        ALLOWED,
        ALLOWED,
        ALLOWED,
        OVER_BUCKET
      ]);
    });
  });

  it("forgets a bucket once it has refilled", async () => {
    await inLimiter("bucket-prune", async (instance, state) => {
      await admit(instance, "198.51.100.4");
      vi.setSystemTime(new Date("2026-10-22T12:05:00Z"));
      await admit(instance, "198.51.100.5");
      expect(state.storage.sql.exec(`SELECT visitor FROM chat_buckets`).toArray()).toEqual([
        { visitor: "198.51.100.5" }
      ]);
    });
  });

  it("denies a fresh visitor once the site's daily turns are spent, without spending its tokens", async () => {
    vi.setSystemTime(new Date("2026-10-22T23:58:00Z"));
    await inLimiter("daily-cap", async instance => {
      const visitors = Array.from({ length: 40 }, (_, i) => `10.1.0.${i}`);
      const spent = await admitAll(instance, visitors.flatMap(ip => repeat(ip, 10)).slice(0, 399));
      expect(spent.every(outcome => outcome.allowed)).toBe(true);

      expect(await admitAll(instance, ["10.1.0.0", "10.2.0.1", "10.2.0.2"])).toEqual([
        OVER_BUCKET,
        ALLOWED,
        OVER_SITE
      ]);

      vi.setSystemTime(new Date("2026-10-23T00:00:00Z"));
      const nextDay = await admitAll(instance, repeat("10.2.0.2", 11));
      expect(nextDay.filter(outcome => outcome.allowed)).toHaveLength(10);
      expect(nextDay[10]).toEqual(OVER_BUCKET);
    });
  });
});

describe("contact slots", () => {
  it("allows a client its daily allowance, then blocks it", async () => {
    await inLimiter("contact-client", instance => {
      for (let i = 0; i < CONTACT_DAILY_PER_CLIENT; i++) {
        expect(instance.takeContactSlot(visitorKey("2.2.2.2"))).toEqual({
          allowed: true,
          clientRemaining: 2 - i,
          globalRemaining: 19 - i
        });
      }
      expect(instance.takeContactSlot(visitorKey("2.2.2.2"))).toEqual({
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
          if (!instance.takeContactSlot(visitorKey(`10.0.0.${client}`)).allowed) break;
          sent++;
        }
      }
      expect(sent).toBe(20);
      expect(instance.takeContactSlot(visitorKey("10.0.9.9"))).toEqual({
        allowed: false,
        scope: "global",
        clientRemaining: 3,
        globalRemaining: 0
      });
    });
  });

  it("does not charge the global counter for a client-blocked request", async () => {
    await inLimiter("contact-no-charge", instance => {
      for (let i = 0; i < CONTACT_DAILY_PER_CLIENT + 2; i++)
        instance.takeContactSlot(visitorKey("5.5.5.5"));
      expect(instance.contactUsage(visitorKey("5.5.5.5")).globalRemaining).toBe(17);
    });
  });

  it("reports the remaining allowance without spending any of it", async () => {
    await inLimiter("contact-usage", instance => {
      expect(instance.contactUsage(visitorKey("6.6.6.6"))).toEqual({
        clientRemaining: 3,
        globalRemaining: 20
      });
      instance.takeContactSlot(visitorKey("6.6.6.6"));
      expect(instance.contactUsage(visitorKey("6.6.6.6"))).toEqual({
        clientRemaining: 2,
        globalRemaining: 19
      });
      expect(instance.contactUsage(visitorKey("7.7.7.7"))).toEqual({
        clientRemaining: 3,
        globalRemaining: 19
      });
    });
  });
});
