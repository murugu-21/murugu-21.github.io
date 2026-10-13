import { describe, expect, it } from "vite-plus/test";

import {
  contactRateLimitHeaders,
  readRateLimitHeaders,
  secondsUntilUtcMidnight
} from "#src/modules/rate-limit/rate-limit-headers.ts";

describe("field serialisation", () => {
  // draft-ietf-httpapi-ratelimit-headers: a list of quota policies, each a
  // Structured Fields String with the q (quota) and w (window) parameters.
  it("writes RateLimit-Policy as one member per policy", () => {
    const headers = contactRateLimitHeaders({
      clientRemaining: 1,
      globalRemaining: 5,
      resetSeconds: 3600
    });
    expect(headers["RateLimit-Policy"]).toBe(
      '"contact-client";q=3;w=86400, "contact-site";q=20;w=86400'
    );
  });

  it("never reports a negative remaining or reset", () => {
    const headers = readRateLimitHeaders({ allowed: false, remaining: -5, resetSeconds: -1 });
    expect(headers.RateLimit).toBe('"reads";r=0;t=0');
  });

  it("mirrors the reported policy into the de-facto X-RateLimit trio", () => {
    const headers = readRateLimitHeaders({
      allowed: true,
      remaining: 7,
      resetSeconds: 30
    });
    expect(headers["X-RateLimit-Limit"]).toBe("600");
    expect(headers["X-RateLimit-Remaining"]).toBe("7");
    expect(headers["X-RateLimit-Reset"]).toBe("30");
  });
});

describe("contactRateLimitHeaders", () => {
  it("reports whichever tier will stop the next request", () => {
    const clientTight = contactRateLimitHeaders({
      clientRemaining: 1,
      globalRemaining: 15,
      resetSeconds: 3600
    });
    expect(clientTight.RateLimit).toBe('"contact-client";r=1;t=3600');

    const globalTight = contactRateLimitHeaders({
      clientRemaining: 3,
      globalRemaining: 0,
      resetSeconds: 3600
    });
    expect(globalTight.RateLimit).toBe('"contact-site";r=0;t=3600');
  });
});

describe("secondsUntilUtcMidnight", () => {
  it("is the whole day at the start of one, and never zero at the end", () => {
    expect(secondsUntilUtcMidnight(new Date("2026-08-25T00:00:00Z"))).toBe(86_400);
    // Never 0, so Retry-After always asks for a real wait.
    expect(secondsUntilUtcMidnight(new Date("2026-08-25T23:59:59.999Z"))).toBe(1);
  });
});
