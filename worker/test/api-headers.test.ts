// The response envelope every API surface shares: version headers, discovery
// Link relations and rate-limit signalling, plus the versioned/unversioned
// path pair that the versioning policy promises.
import {env} from "cloudflare:test";
import {beforeEach, describe, expect, it} from "vitest";

import {CONTACT_DAILY_PER_CLIENT} from "../api/contact";
import {READ_QUOTA, resetReadWindows} from "../api/ratelimit";
import {API_PATHS, CURRENT_API_VERSION} from "../api/routes";
import {API_VERSION} from "../api/versioning";
import worker from "../server";
import {fakeAssets} from "./fixtures";

function testEnv(): Env {
  return {
    ...env,
    ASSETS: fakeAssets(),
    OPPORTUNITY_INBOX: "inbox@example.com",
    EMAIL: {send: () => Promise.resolve()}
  } as unknown as Env;
}

const get = async (path: string, ip?: string): Promise<Response> =>
  await worker.fetch(
    new Request(
      `https://murugappan.dev${path}`,
      ip ? {headers: {"CF-Connecting-IP": ip}} : undefined
    ),
    testEnv()
  );

beforeEach(() => resetReadWindows());

describe("path versioning", () => {
  const endpoints = [
    "/profile",
    "/experience",
    "/skills",
    "/education",
    "/open-source",
    "/posts"
  ];

  it("serves every endpoint under the versioned prefix", async () => {
    for (const endpoint of endpoints) {
      const res = await get(`/api/${CURRENT_API_VERSION}${endpoint}`);
      expect(res.status, endpoint).toBe(200);
    }
  });

  it("serves the same body under the unversioned alias", async () => {
    for (const endpoint of endpoints) {
      const versioned = await (
        await get(`/api/${CURRENT_API_VERSION}${endpoint}`)
      ).text();
      const alias = await (await get(`/api${endpoint}`)).text();
      expect(alias, endpoint).toBe(versioned);
    }
  });

  it("serves a templated path under both prefixes", async () => {
    const versioned = await get("/api/v1/posts/coin-change-problem");
    const alias = await get("/api/posts/coin-change-problem");
    expect(versioned.status).toBe(200);
    expect(await versioned.text()).toBe(await alias.text());
  });

  it("404s an unknown endpoint under the versioned prefix, as JSON", async () => {
    const res = await get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
    const body = (await res.json()) as {error: {code: string; message: string}};
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toContain("/api/v1/nope");
  });

  it("405s the wrong method on a versioned path and names the right ones", async () => {
    const res = await worker.fetch(
      new Request("https://murugappan.dev/api/v1/profile", {method: "POST"}),
      testEnv()
    );
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
  });

  it("404s a made-up version rather than silently serving v1", async () => {
    const res = await get("/api/v9/profile");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
  });
});

describe("GET /api/versions", () => {
  it("is served under both prefixes", async () => {
    for (const path of [API_PATHS.versions, "/api/versions"]) {
      const res = await get(path);
      expect(res.status, path).toBe(200);
      const body = (await res.json()) as {current: string};
      expect(body.current, path).toBe(CURRENT_API_VERSION);
    }
  });

  it("returns the catalogue and the policy an agent needs before integrating", async () => {
    const body = (await (await get(API_PATHS.versions)).json()) as {
      currentRelease: string;
      unversionedAlias: {pinnedTo: string};
      versions: Array<{version: string; status: string; sunsetOn: null}>;
      policy: {scheme: string; rules: string[]; deprecationNoticeDays: number};
    };
    expect(body.currentRelease).toBe(API_VERSION);
    expect(body.unversionedAlias.pinnedTo).toBe(CURRENT_API_VERSION);
    expect(body.versions[0]).toMatchObject({
      version: CURRENT_API_VERSION,
      status: "current",
      sunsetOn: null
    });
    expect(body.policy.scheme).toBe("url-path");
    expect(body.policy.deprecationNoticeDays).toBeGreaterThan(0);
    expect(body.policy.rules.length).toBeGreaterThan(3);
  });
});

describe("version headers", () => {
  const paths = [
    "/api/v1/profile",
    "/api/profile",
    "/api/v1/versions",
    "/api/nope",
    "/openapi.json"
  ];

  it("names the release and the supported versions on every response", async () => {
    for (const path of paths) {
      const res = await get(path);
      expect(res.headers.get("API-Version"), path).toBe(API_VERSION);
      expect(res.headers.get("API-Supported-Versions"), path).toBe(
        CURRENT_API_VERSION
      );
    }
  });

  it("claims no deprecation while nothing is deprecated", async () => {
    const res = await get("/api/v1/profile");
    expect(res.headers.get("Deprecation")).toBeNull();
    expect(res.headers.get("Sunset")).toBeNull();
  });

  it("links the spec, the docs, the version history and the catalogue", async () => {
    const link = (await get("/api/v1/profile")).headers.get("Link") ?? "";
    expect(link).toContain('rel="service-desc"');
    expect(link).toContain('rel="service-doc"');
    expect(link).toContain('rel="version-history"');
    expect(link).toContain('rel="api-catalog"');
  });
});

describe("rate-limit headers", () => {
  it("reports the live read allowance on a read", async () => {
    const res = await get("/api/v1/profile", "198.51.100.1");
    expect(res.headers.get("RateLimit-Policy")).toBe(
      `"reads";q=${READ_QUOTA.quota};w=${READ_QUOTA.windowSeconds}`
    );
    expect(res.headers.get("RateLimit")).toMatch(
      new RegExp(`^"reads";r=${READ_QUOTA.quota - 1};t=\\d+$`)
    );
    expect(res.headers.get("X-RateLimit-Remaining")).toBe(
      String(READ_QUOTA.quota - 1)
    );
  });

  it("counts down across requests from the same client", async () => {
    await get("/api/v1/profile", "198.51.100.2");
    const res = await get("/api/v1/skills", "198.51.100.2");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe(
      String(READ_QUOTA.quota - 2)
    );
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
    const body = (await res.json()) as {error: {code: string; hint: string}};
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.hint).toContain("RateLimit");
  });

  it("keeps the spec reachable for a client that has been throttled", async () => {
    const ip = "198.51.100.4";
    for (let i = 0; i < READ_QUOTA.quota + 5; i++)
      await get("/api/v1/profile", ip);
    const res = await get("/openapi.json", ip);
    expect(res.status).toBe(200);
    expect(res.headers.get("RateLimit")).toMatch(/^"reads";r=0;t=\d+$/);
  });

  it("advertises the contact policies, not the read one, on the write endpoint", async () => {
    const res = await worker.fetch(
      new Request("https://murugappan.dev/api/v1/contact", {method: "GET"}),
      testEnv()
    );
    expect(res.status).toBe(405);
    const policy = res.headers.get("RateLimit-Policy") ?? "";
    expect(policy).toContain('"contact-client"');
    expect(policy).toContain('"contact-site"');
    expect(policy).not.toContain('"reads"');
  });

  it("reports the remaining daily allowance on an accepted message", async () => {
    const res = await worker.fetch(
      new Request("https://murugappan.dev/api/v1/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "198.51.100.30"
        },
        body: JSON.stringify({
          email: "ada@example.com",
          message: "We are hiring a senior backend engineer for healthcare."
        })
      }),
      testEnv()
    );
    expect(res.status).toBe(202);
    expect(res.headers.get("RateLimit")).toBe(
      `"contact-client";r=${CONTACT_DAILY_PER_CLIENT - 1};t=${res.headers.get("X-RateLimit-Reset")}`
    );
  });

  it("reports the allowance a dry run did not spend", async () => {
    const send = () =>
      worker.fetch(
        new Request("https://murugappan.dev/api/v1/contact", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "CF-Connecting-IP": "198.51.100.31"
          },
          body: JSON.stringify({
            email: "ada@example.com",
            message: "We are hiring a senior backend engineer for healthcare.",
            dryRun: true
          })
        }),
        testEnv()
      );
    const first = await send();
    expect(first.status).toBe(200);
    expect(first.headers.get("X-RateLimit-Remaining")).toBe(
      String(CONTACT_DAILY_PER_CLIENT)
    );
    // Still untouched after a second dry run: the allowance is not spent.
    expect((await send()).headers.get("X-RateLimit-Remaining")).toBe(
      String(CONTACT_DAILY_PER_CLIENT)
    );
  });

  it("exposes the signalling headers to a browser client", async () => {
    const res = await worker.fetch(
      new Request("https://murugappan.dev/api/v1/profile", {
        headers: {Origin: "https://agent.example"}
      }),
      testEnv()
    );
    const exposed = res.headers.get("Access-Control-Expose-Headers") ?? "";
    for (const name of [
      "RateLimit",
      "RateLimit-Policy",
      "Retry-After",
      "API-Version",
      "Deprecation",
      "Sunset",
      "Link"
    ]) {
      expect(exposed, name).toContain(name);
    }
  });
});
