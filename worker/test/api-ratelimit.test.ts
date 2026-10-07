import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { CONTACT_DAILY_GLOBAL, CONTACT_DAILY_PER_CLIENT } from "#contracts/api/contact.ts";
import { CONTACT_CLIENT_QUOTA, CONTACT_GLOBAL_QUOTA, READ_QUOTA } from "#contracts/api/quotas.ts";
import {
  contactRateLimitHeaders,
  readRateLimitHeaders,
  resetReadWindows,
  secondsUntilUtcMidnight,
  takeReadSlot
} from "#worker/api/ratelimit.ts";
import { fetchWorker, readJson } from "./fixtures";

beforeEach(() => resetReadWindows());

const get = (path: string, ip?: string) => fetchWorker(path, { ip });

const postContact = (body: unknown, ip: string) =>
  fetchWorker("/api/v1/contact", {
    ip,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

const validMessage = {
  email: "ada@example.com",
  message: "We are hiring a senior backend engineer for healthcare."
};

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
      `"contact-client";q=${CONTACT_DAILY_PER_CLIENT};w=86400, "contact-site";q=${CONTACT_DAILY_GLOBAL};w=86400`
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
    expect(headers["X-RateLimit-Limit"]).toBe(String(READ_QUOTA.quota));
    expect(headers["X-RateLimit-Remaining"]).toBe("7");
    expect(headers["X-RateLimit-Reset"]).toBe("30");
  });
});

describe("takeReadSlot", () => {
  const now = 1_000_000;

  it("spends one slot per call and counts down", () => {
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
    takeReadSlot("1.1.1.1", now);
    expect(takeReadSlot("2.2.2.2", now)).toMatchObject({
      remaining: READ_QUOTA.quota - 1
    });
  });

  it("refuses once the window's quota is spent, and says for how long", () => {
    for (let i = 0; i < READ_QUOTA.quota; i++) takeReadSlot("3.3.3.3", now);
    const blocked = takeReadSlot("3.3.3.3", now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetSeconds).toBe(READ_QUOTA.windowSeconds);
  });

  it("counts down the reset as the window elapses", () => {
    takeReadSlot("4.4.4.4", now);
    const later = takeReadSlot("4.4.4.4", now + 30_000);
    expect(later.resetSeconds).toBe(READ_QUOTA.windowSeconds - 30);
  });

  it("starts a fresh window once the old one has passed", () => {
    for (let i = 0; i < READ_QUOTA.quota; i++) takeReadSlot("5.5.5.5", now);
    expect(takeReadSlot("5.5.5.5", now).allowed).toBe(false);
    const next = takeReadSlot("5.5.5.5", now + READ_QUOTA.windowSeconds * 1000 + 1);
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
    expect(clientTight.RateLimit).toBe(`"${CONTACT_CLIENT_QUOTA.name}";r=1;t=3600`);

    const globalTight = contactRateLimitHeaders({
      clientRemaining: 3,
      globalRemaining: 0,
      resetSeconds: 3600
    });
    expect(globalTight.RateLimit).toBe(`"${CONTACT_GLOBAL_QUOTA.name}";r=0;t=3600`);
  });
});

describe("secondsUntilUtcMidnight", () => {
  it("is the whole day at the start of one, and never zero at the end", () => {
    expect(secondsUntilUtcMidnight(new Date("2026-08-25T00:00:00Z"))).toBe(86_400);
    // Never 0, so Retry-After always asks for a real wait.
    expect(secondsUntilUtcMidnight(new Date("2026-08-25T23:59:59.999Z"))).toBe(1);
  });
});

describe("read limiting through the worker", () => {
  it("reports the live read allowance on a read", async () => {
    const res = await get("/api/v1/profile", "198.51.100.1");
    expect(res.headers.get("RateLimit-Policy")).toBe(
      `"reads";q=${READ_QUOTA.quota};w=${READ_QUOTA.windowSeconds}`
    );
    expect(res.headers.get("RateLimit")).toMatch(
      new RegExp(`^"reads";r=${READ_QUOTA.quota - 1};t=\\d+$`)
    );
    expect(res.headers.get("X-RateLimit-Remaining")).toBe(String(READ_QUOTA.quota - 1));
  });

  it("advertises the policy even when there is no client address to count", async () => {
    const res = await get("/api/v1/profile");
    expect(res.headers.get("RateLimit-Policy")).toContain('"reads"');
    expect(res.headers.get("RateLimit")).toBeNull();
  });

  it("429s a client past the read ceiling, with Retry-After", async () => {
    const ip = "198.51.100.3";
    for (let i = 0; i < READ_QUOTA.quota; i++) await get("/api/v1/profile", ip);
    const res = await get("/api/v1/profile", ip);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(res.headers.get("RateLimit")).toMatch(/^"reads";r=0;t=\d+$/);
    const body = await readJson(
      res,
      z.object({ error: z.object({ code: z.string(), hint: z.string() }) })
    );
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.hint).toContain("RateLimit");
  });

  it("keeps the spec reachable for a client that has been throttled", async () => {
    const ip = "198.51.100.4";
    for (let i = 0; i < READ_QUOTA.quota + 5; i++) await get("/api/v1/profile", ip);
    const res = await get("/openapi.json", ip);
    expect(res.status).toBe(200);
    expect(res.headers.get("RateLimit")).toMatch(/^"reads";r=0;t=\d+$/);
  });
});

describe("contact limiting through the worker", () => {
  it("advertises the contact policies, not the read one, on the write endpoint", async () => {
    const res = await get("/api/v1/contact");
    expect(res.status).toBe(405);
    const policy = res.headers.get("RateLimit-Policy") ?? "";
    expect(policy).toContain('"contact-client"');
    expect(policy).toContain('"contact-site"');
    expect(policy).not.toContain('"reads"');
  });

  it("reports the remaining daily allowance on an accepted message", async () => {
    const res = await postContact(validMessage, "198.51.100.30");
    expect(res.status).toBe(202);
    expect(res.headers.get("RateLimit")).toBe(
      `"contact-client";r=${CONTACT_DAILY_PER_CLIENT - 1};t=${res.headers.get("X-RateLimit-Reset")}`
    );
  });

  it("429s a client once its daily allowance is spent", async () => {
    for (let i = 0; i < CONTACT_DAILY_PER_CLIENT; i++) {
      expect((await postContact(validMessage, "198.51.100.7")).status).toBe(202);
    }
    const res = await postContact(validMessage, "198.51.100.7");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
    const { error } = await readJson(res, z.object({ error: z.object({ code: z.string() }) }));
    expect(error.code).toBe("rate_limited");
  });

  it("does not spend a slot on an invalid request", async () => {
    for (let i = 0; i < CONTACT_DAILY_PER_CLIENT + 1; i++) {
      const res = await postContact({ email: "nope", message: "hi" }, "198.51.100.8");
      expect(res.status).toBe(422);
    }
    expect((await postContact(validMessage, "198.51.100.8")).status).toBe(202);
  });

  it("does not spend a slot on a dry run", async () => {
    for (let i = 0; i < CONTACT_DAILY_PER_CLIENT + 2; i++) {
      const res = await postContact({ ...validMessage, dryRun: true }, "198.51.100.21");
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe(String(CONTACT_DAILY_PER_CLIENT));
    }
    expect((await postContact(validMessage, "198.51.100.21")).status).toBe(202);
  });
});
