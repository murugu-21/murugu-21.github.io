import {beforeEach, describe, expect, it} from "vitest";

import {CONTACT_DAILY_GLOBAL, CONTACT_DAILY_PER_CLIENT} from "../api/contact";
import {
  CONTACT_CLIENT_QUOTA,
  CONTACT_GLOBAL_QUOTA,
  CONTACT_QUOTAS,
  contactRateLimitHeaders,
  policyField,
  rateLimitField,
  RATE_LIMIT_EXPOSED_HEADERS,
  READ_QUOTA,
  readRateLimitHeaders,
  resetReadWindows,
  secondsUntilUtcMidnight,
  takeReadSlot
} from "../api/ratelimit";

beforeEach(() => resetReadWindows());

describe("field serialisation", () => {
  // draft-ietf-httpapi-ratelimit-headers: a list of quota policies, each a
  // Structured Fields String with the q (quota) and w (window) parameters.
  it("writes RateLimit-Policy as one member per policy", () => {
    expect(policyField([READ_QUOTA])).toBe(
      `"reads";q=${READ_QUOTA.quota};w=${READ_QUOTA.windowSeconds}`
    );
    expect(policyField(CONTACT_QUOTAS)).toBe(
      `"contact-client";q=${CONTACT_DAILY_PER_CLIENT};w=86400, "contact-site";q=${CONTACT_DAILY_GLOBAL};w=86400`
    );
  });

  // The same draft: RateLimit reports one policy, with r (remaining) and t
  // (seconds until the quota resets).
  it("writes RateLimit as the live snapshot of one policy", () => {
    expect(rateLimitField(READ_QUOTA, 599, 42)).toBe('"reads";r=599;t=42');
  });

  it("never reports a negative remaining or reset", () => {
    expect(rateLimitField(READ_QUOTA, -5, -1)).toBe('"reads";r=0;t=0');
  });

  it("mirrors the reported policy into the de-facto X-RateLimit trio", () => {
    const headers = readRateLimitHeaders({
      allowed: true,
      remaining: 7,
      resetSeconds: 30
    });
    expect(headers["X-RateLimit-Limit"]).toBe(String(READ_QUOTA.quota));
    expect(headers["X-RateLimit-Remaining"]).toBe("7");
    expect(headers["X-RateLimit-Reset"]).toBe("30");
  });

  it("exposes every header a browser client needs to self-throttle", () => {
    expect([...RATE_LIMIT_EXPOSED_HEADERS].sort()).toEqual([
      "RateLimit",
      "RateLimit-Policy",
      "Retry-After",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset"
    ]);
  });
});

describe("takeReadSlot", () => {
  it("spends one slot per call and counts down", () => {
    const now = 1_000_000;
    expect(takeReadSlot("1.1.1.1", now)).toMatchObject({
      allowed: true,
      remaining: READ_QUOTA.quota - 1
    });
    expect(takeReadSlot("1.1.1.1", now)).toMatchObject({
      allowed: true,
      remaining: READ_QUOTA.quota - 2
    });
  });

  it("counts each client separately", () => {
    const now = 1_000_000;
    takeReadSlot("1.1.1.1", now);
    expect(takeReadSlot("2.2.2.2", now)).toMatchObject({
      remaining: READ_QUOTA.quota - 1
    });
  });

  it("refuses once the window's quota is spent, and says for how long", () => {
    const now = 1_000_000;
    for (let i = 0; i < READ_QUOTA.quota; i++) takeReadSlot("3.3.3.3", now);
    const blocked = takeReadSlot("3.3.3.3", now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetSeconds).toBe(READ_QUOTA.windowSeconds);
  });

  it("counts down the reset as the window elapses", () => {
    const now = 1_000_000;
    takeReadSlot("4.4.4.4", now);
    const later = takeReadSlot("4.4.4.4", now + 30_000);
    expect(later.resetSeconds).toBe(READ_QUOTA.windowSeconds - 30);
  });

  it("starts a fresh window once the old one has passed", () => {
    const now = 1_000_000;
    for (let i = 0; i < READ_QUOTA.quota; i++) takeReadSlot("5.5.5.5", now);
    expect(takeReadSlot("5.5.5.5", now).allowed).toBe(false);
    const next = takeReadSlot(
      "5.5.5.5",
      now + READ_QUOTA.windowSeconds * 1000 + 1
    );
    expect(next.allowed).toBe(true);
    expect(next.remaining).toBe(READ_QUOTA.quota - 1);
  });
});

describe("contactRateLimitHeaders", () => {
  it("reports whichever tier will stop the next request", () => {
    const clientTight = contactRateLimitHeaders({
      clientRemaining: 1,
      globalRemaining: 15,
      resetSeconds: 3600
    });
    expect(clientTight.RateLimit).toBe(
      `"${CONTACT_CLIENT_QUOTA.name}";r=1;t=3600`
    );

    const globalTight = contactRateLimitHeaders({
      clientRemaining: 3,
      globalRemaining: 0,
      resetSeconds: 3600
    });
    expect(globalTight.RateLimit).toBe(
      `"${CONTACT_GLOBAL_QUOTA.name}";r=0;t=3600`
    );
  });

  it("always advertises both contact policies", () => {
    const headers = contactRateLimitHeaders({
      clientRemaining: 2,
      globalRemaining: 19,
      resetSeconds: 10
    });
    expect(headers["RateLimit-Policy"]).toContain('"contact-client"');
    expect(headers["RateLimit-Policy"]).toContain('"contact-site"');
  });
});

describe("secondsUntilUtcMidnight", () => {
  it("is the whole day at the start of one", () => {
    expect(secondsUntilUtcMidnight(new Date("2026-08-25T00:00:00Z"))).toBe(
      86_400
    );
  });

  it("is never zero, so Retry-After always asks for a real wait", () => {
    expect(
      secondsUntilUtcMidnight(new Date("2026-08-25T23:59:59.999Z"))
    ).toBeGreaterThan(0);
  });
});
