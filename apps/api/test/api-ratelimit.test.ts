import { beforeEach, describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { CONTACT_DAILY_PER_CLIENT } from "@murugappan/contracts/api/contact.ts";
import { READ_QUOTA } from "@murugappan/contracts/api/quotas.ts";
import { resetReadWindows } from "#src/modules/rate-limit/read-quota.store.ts";
import { apiClient, fetchWorker, readJson } from "./fixtures";

beforeEach(() => resetReadWindows());

const validMessage = {
  email: "ada@example.com",
  message: "We are hiring a senior backend engineer for healthcare."
};

describe("read limiting through the worker", () => {
  it("reports the live read allowance on a read", async () => {
    const res = await apiClient({ ip: "198.51.100.1" }).api.v1.profile.$get();
    expect(res.headers.get("RateLimit-Policy")).toBe('"reads";q=600;w=60');
    expect(res.headers.get("RateLimit")).toMatch(/^"reads";r=599;t=\d+$/);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("599");
  });

  it("advertises the policy even when there is no client address to count", async () => {
    const res = await apiClient().api.v1.profile.$get();
    expect(res.headers.get("RateLimit-Policy")).toContain('"reads"');
    expect(res.headers.get("RateLimit")).toBeNull();
  });

  it("429s a client past the read ceiling, with Retry-After", async () => {
    const { profile } = apiClient({ ip: "198.51.100.3" }).api.v1;
    for (let i = 0; i < READ_QUOTA.quota; i++) await profile.$get();
    const res = await profile.$get();
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

  it("counts every address in an IPv6 /64 as one reader", async () => {
    const read = (ip: string) =>
      apiClient({ ip })
        .api.v1.profile.$get()
        .then(res => res.status);
    for (let i = 0; i < READ_QUOTA.quota; i++) await read(`2001:db8:8::${(i % 16).toString(16)}`);
    expect(await read("2001:DB8:8:0:ffff::1")).toBe(429);
    expect(await read("2001:db8:8:1::1")).toBe(200);
  });

  it("keeps the spec reachable for a client that has been throttled", async () => {
    const client = apiClient({ ip: "198.51.100.4" });
    for (let i = 0; i < READ_QUOTA.quota + 5; i++) await client.api.v1.profile.$get();
    const res = await client["openapi.json"].$get();
    expect(res.status).toBe(200);
    expect(res.headers.get("RateLimit")).toMatch(/^"reads";r=0;t=\d+$/);
  });
});

describe("contact limiting through the worker", () => {
  it("advertises the contact policies, not the read one, on the write endpoint", async () => {
    const res = await fetchWorker("/api/v1/contact");
    expect(res.status).toBe(405);
    const policy = res.headers.get("RateLimit-Policy") ?? "";
    expect(policy).toContain('"contact-client"');
    expect(policy).toContain('"contact-site"');
    expect(policy).not.toContain('"reads"');
  });

  it("reports the remaining daily allowance on an accepted message", async () => {
    const res = await apiClient({ ip: "198.51.100.30" }).api.v1.contact.$post({
      json: validMessage
    });
    expect(res.status).toBe(202);
    expect(res.headers.get("RateLimit")).toBe(
      `"contact-client";r=2;t=${res.headers.get("X-RateLimit-Reset")}`
    );
  });

  it("429s a client once its daily allowance is spent", async () => {
    const { contact } = apiClient({ ip: "198.51.100.7" }).api.v1;
    for (let i = 0; i < CONTACT_DAILY_PER_CLIENT; i++) {
      expect((await contact.$post({ json: validMessage })).status).toBe(202);
    }
    const res = await contact.$post({ json: validMessage });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
    const { error } = await readJson(
      res,
      z.object({ error: z.object({ code: z.string(), message: z.string() }) })
    );
    expect(error).toEqual({
      code: "rate_limited",
      message: "This client has already sent 3 messages today."
    });
  });

  it("counts every address in an IPv6 /64 as one client", async () => {
    const post = (ip: string) =>
      apiClient({ ip })
        .api.v1.contact.$post({ json: validMessage })
        .then(res => res.status);
    const statuses = [];
    for (const ip of ["2001:db8:7::1", "2001:db8:7::2", "2001:DB8:7:0:ffff::3", "2001:db8:7::4"]) {
      statuses.push(await post(ip));
    }
    statuses.push(await post("2001:db8:7:1::1"));
    expect(statuses).toEqual([202, 202, 202, 429, 202]);
  });

  it("does not spend a slot on an invalid request", async () => {
    const { contact } = apiClient({ ip: "198.51.100.8" }).api.v1;
    for (let i = 0; i < CONTACT_DAILY_PER_CLIENT + 1; i++) {
      const res = await contact.$post({ json: { email: "nope", message: "hi" } });
      expect(res.status).toBe(422);
    }
    expect((await contact.$post({ json: validMessage })).status).toBe(202);
  });

  it("does not spend a slot on a dry run", async () => {
    const { contact } = apiClient({ ip: "198.51.100.21" }).api.v1;
    for (let i = 0; i < CONTACT_DAILY_PER_CLIENT + 2; i++) {
      const res = await contact.$post({ json: { ...validMessage, dryRun: true } });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("3");
    }
    expect((await contact.$post({ json: validMessage })).status).toBe(202);
  });
});
