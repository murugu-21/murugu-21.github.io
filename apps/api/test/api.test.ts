import { Effect, Layer } from "effect";
import type { ClientResponse } from "hono/client";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import {
  EducationList,
  ExperienceList,
  OpenSourceList,
  SkillsResponse
} from "@murugappan/contracts/api/dataset.ts";
import { ApiVersions } from "@murugappan/contracts/api/versioning.ts";
import { appLayer } from "#src/app.module.ts";
import { PostsRepository } from "#src/modules/posts/posts.repository.ts";
import {
  ContactLimitReached,
  QuotaUnavailable
} from "#src/modules/rate-limit/contact-quota.repository.ts";
import {
  apiClient,
  capturedErrors,
  fakeContactQuota,
  fetchWorker,
  readJson,
  recordingEmail,
  type JsonBody
} from "./fixtures";

const client = apiClient();
const v1 = client.api.v1;
type Prefix = typeof v1 | typeof client.api;

const PostList = z.object({ posts: z.array(z.object({ slug: z.string() })), count: z.number() });

async function errorBody(res: JsonBody) {
  const body = await readJson(
    res,
    z.object({
      error: z.object({
        code: z.string(),
        message: z.string(),
        hint: z.string(),
        documentation_url: z.string(),
        details: z.unknown().optional()
      })
    })
  );
  return body.error;
}

describe("GET /api/profile", () => {
  it("returns the person and links as cacheable, cross-origin JSON", async () => {
    const res = await client.api.profile.$get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = await readJson(
      res,
      z.object({
        person: z.object({ name: z.string(), currentRole: z.object({ company: z.string() }) }),
        links: z.array(z.object({ label: z.string() }))
      })
    );
    expect(body.person.name).toBe("Murugappan M");
    expect(body.person.currentRole.company).toBe("MedMe Health");
    expect(body.links.map(l => l.label)).toContain("OpenAPI spec");
  });
});

describe("path versioning", () => {
  it.each<[string, (prefix: Prefix) => Promise<ClientResponse<unknown>>]>([
    ["/profile", prefix => prefix.profile.$get()],
    ["/experience", prefix => prefix.experience.$get()],
    ["/skills", prefix => prefix.skills.$get()],
    ["/education", prefix => prefix.education.$get()],
    ["/open-source", prefix => prefix["open-source"].$get()],
    ["/posts", prefix => prefix.posts.$get({ query: {} })],
    [
      "/posts/coin-change-problem",
      prefix => prefix.posts[":slug"].$get({ param: { slug: "coin-change-problem" } })
    ]
  ])(
    "serves %s under the versioned prefix and the same body under the alias",
    async (_, request) => {
      const versioned = await request(v1);
      expect(versioned.status).toBe(200);
      const text = await versioned.text();
      expect(await (await request(client.api)).text()).toBe(text);
    }
  );

  it.each<[string, Prefix]>([
    ["/api/v1", v1],
    ["/api", client.api]
  ])("serves the version catalogue at %s/versions", async (_, prefix) => {
    const res = await prefix.versions.$get();
    expect(res.status).toBe(200);
    const body = await readJson(res, ApiVersions);
    expect(body.current).toBe("v1");
    expect(body.versions[0]).toMatchObject({
      version: "v1",
      url: "http://localhost/api/v1",
      specUrl: "http://localhost/openapi.json"
    });
    expect(body.policy.documentationUrl).toBe("http://localhost/developers/#versioning");
  });

  it("stamps the version and discovery headers on every response", async () => {
    const responses = [
      ["/api/v1/profile", await v1.profile.$get()],
      ["/api/profile", await client.api.profile.$get()],
      ["/api/v1/versions", await v1.versions.$get()],
      ["/api/nope", await fetchWorker("/api/nope")],
      ["/openapi.json", await client["openapi.json"].$get()]
    ] as const;
    for (const [path, res] of responses) {
      expect(res.headers.get("API-Version"), path).toBe("1.0.0");
      expect(res.headers.get("API-Supported-Versions"), path).toBe("v1");
      expect(res.headers.get("Link"), path).toContain('rel="version-history"');
    }
  });

  it("exposes the signalling headers to a browser client", async () => {
    const res = await v1.profile.$get(undefined, {
      headers: { Origin: "https://agent.example" }
    });
    const exposed = res.headers.get("Access-Control-Expose-Headers") ?? "";
    for (const name of [
      "RateLimit",
      "RateLimit-Policy",
      "Retry-After",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "API-Version",
      "Deprecation",
      "Sunset",
      "Link"
    ]) {
      expect(exposed, name).toContain(name);
    }
  });
});

describe("the dataset endpoints", () => {
  it("lists the roles, back to the first internship", async () => {
    const body = await readJson(await v1.experience.$get(), ExperienceList);
    expect(body.experience.at(-1)).toMatchObject({
      company: "Samsung R&D Institute India",
      role: "R&D Intern",
      period: "December 2021 – August 2022",
      current: false
    });
  });

  it("groups the skills by category", async () => {
    const body = await readJson(await v1.skills.$get(), SkillsResponse);
    const languages = body.skills.find(group => group.category === "Languages");
    expect(languages?.skills).toContain("TypeScript");
    expect(body.proficiencies.map(p => p.area)).toContain("Backend");
  });

  it("lists the education", async () => {
    const body = await readJson(await v1.education.$get(), EducationList);
    expect(body.education[0]).toMatchObject({
      institution: "Kumaraguru College of Technology",
      credential: "Bachelor of Engineering in Computer Science"
    });
  });

  it("lists the open-source contributions", async () => {
    const body = await readJson(await v1["open-source"].$get(), OpenSourceList);
    expect(body.openSource.map(c => c.project)).toContain("AnkiDroid");
  });
});

// Hono answers HEAD from the GET route, so the typed client, which has no $head, can't send one.
describe("HEAD on the read endpoints", () => {
  it.each([
    "/api/v1/profile",
    "/api/v1/experience",
    "/api/v1/skills",
    "/api/v1/education",
    "/api/v1/open-source",
    "/api/v1/posts",
    "/api/v1/posts/coin-change-problem",
    "/api/v1/versions",
    "/api/v1/openapi.json",
    "/api/profile",
    "/openapi.json"
  ])("answers HEAD %s with GET's headers and no body", async path => {
    const get = await fetchWorker(path);
    const head = await fetchWorker(path, { method: "HEAD" });
    for (const [method, res] of [
      ["GET", get],
      ["HEAD", head]
    ] as const) {
      expect(res.status, method).toBe(200);
      expect(res.headers.get("Content-Type"), method).toBe("application/json; charset=utf-8");
      expect(res.headers.get("Cache-Control"), method).toBe("public, max-age=300");
    }
    expect(await get.text()).toMatch(/^\{/);
    expect(await head.text()).toBe("");
  });
});

describe("GET /api/posts", () => {
  it("lists every published post newest first, with a count", async () => {
    const res = await client.api.posts.$get({ query: {} });
    expect(res.status).toBe(200);
    const body = await readJson(res, PostList);
    const slugs = body.posts.map(p => p.slug);
    expect(body.count).toBe(slugs.length);
    expect(slugs.indexOf("cloud-agnostic-rate-limiting")).toBeLessThan(
      slugs.indexOf("coin-change-problem")
    );
    expect(slugs.at(-1)).toBe("coin-change-problem");
    expect(slugs.filter(slug => slug.includes("js-closure"))).toEqual([]);
  });

  it("filters case-insensitively on title and summary", async () => {
    const res = await client.api.posts.$get({ query: { q: "RATE LIMITING" } });
    const body = await readJson(res, PostList);
    expect(body.count).toBe(1);
    expect(body.posts[0].slug).toBe("cloud-agnostic-rate-limiting");
  });

  it("caps the list with limit", async () => {
    const res = await client.api.posts.$get({ query: { limit: "1" } });
    const body = await readJson(res, PostList);
    expect(body.count).toBe(1);
  });

  it("rejects a non-numeric limit with a field-level error", async () => {
    const res = await client.api.posts.$get({ query: { limit: "lots" } });
    expect(res.status).toBe(400);
    const error = await errorBody(res);
    expect(error.code).toBe("invalid_request");
    expect(error.details).toEqual([
      { field: "limit", issue: "must be an integer between 1 and 100" }
    ]);
  });

  it("rejects an out-of-range limit", async () => {
    expect((await client.api.posts.$get({ query: { limit: "0" } })).status).toBe(400);
    expect((await client.api.posts.$get({ query: { limit: "101" } })).status).toBe(400);
  });

  it("rejects a q longer than the 200 characters the spec allows", async () => {
    expect((await client.api.posts.$get({ query: { q: "a".repeat(200) } })).status).toBe(200);
    const res = await client.api.posts.$get({ query: { q: "a".repeat(201) } });
    expect(res.status).toBe(400);
    const error = await errorBody(res);
    expect(error.details).toEqual([{ field: "q", issue: "must be at most 200 characters" }]);
  });
});

describe("GET /api/posts/{slug}", () => {
  it("returns the post with its markdown source", async () => {
    const res = await client.api.posts[":slug"].$get({ param: { slug: "coin-change-problem" } });
    expect(res.status).toBe(200);
    const body = await readJson(
      res,
      z.object({
        slug: z.string(),
        title: z.string(),
        url: z.string(),
        description: z.string(),
        markdown: z.string()
      })
    );
    expect(body).toMatchObject({
      slug: "coin-change-problem",
      title: "Coin Change Problem",
      url: "https://murugappan.dev/blog/coin-change-problem/",
      description: "Find minimum number of coins that make a given value."
    });
    expect(body.markdown).toMatch(
      /^---\ntitle: Coin Change Problem\n[\s\S]*\n---\n\nWhen I was a child/
    );
  });

  it("404s a slug that is not published, pointing at the list endpoint", async () => {
    const res = await client.api.posts[":slug"].$get({ param: { slug: "no-such-post" } });
    expect(res.status).toBe(404);
    const error = await errorBody(res);
    expect(error.code).toBe("not_found");
    expect(error.hint).toContain("/api/posts");
  });

  // Encoded slugs go through fetchWorker, since a typed client means to encode its params itself.
  it("404s a draft by either of its names", async () => {
    const responses = [
      ["js-closure", await client.api.posts[":slug"].$get({ param: { slug: "js-closure" } })],
      ["draft%2Fjs-closure", await fetchWorker("/api/posts/draft%2Fjs-closure")]
    ] as const;
    for (const [slug, res] of responses) {
      expect(res.status, slug).toBe(404);
      expect((await errorBody(res)).code, slug).toBe("not_found");
    }
  });

  it("404s a path-traversal attempt as JSON", async () => {
    const res = await fetchWorker("/api/posts/..%2F..%2Fllms.txt");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
  });
});

describe("the OpenAPI spec", () => {
  it.each([
    ["/openapi.json", () => client["openapi.json"].$get()],
    ["/api/openapi.json", () => client.api["openapi.json"].$get()],
    ["/api/v1/openapi.json", () => v1["openapi.json"].$get()]
  ])("is served at %s", async (_, request) => {
    const res = await request();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
    expect((await readJson(res, z.object({ openapi: z.string() }))).openapi).toBe("3.1.0");
  });

  it.each([
    ["https://preview.example", "https://preview.example"],
    ["http://murugappan.dev", "https://murugappan.dev"],
    ["http://localhost:8787", "http://localhost:8787"]
  ])("names %s as %s in servers", async (origin, server) => {
    const res = await fetchWorker(`${origin}/openapi.json`);
    const body = await readJson(res, z.object({ servers: z.array(z.object({ url: z.string() })) }));
    expect(body.servers[0].url).toBe(server);
  });
});

describe("error handling under /api", () => {
  it.each(["/api/nope", "/api/v1/nope", "/api/v9/profile", "/api/profile/", "/api/posts/a/b"])(
    "404s %s as JSON, never as the HTML 404 page",
    async path => {
      const res = await fetchWorker(path);
      expect(res.status).toBe(404);
      expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
      const error = await errorBody(res);
      expect(error.code).toBe("not_found");
      expect(error.message).toContain(path);
      expect(error.hint).toContain("/openapi.json");
      expect(error.documentation_url).toBe("https://murugappan.dev/developers/");
    }
  );

  it.each([
    ["POST", "/api/profile", "GET, HEAD, OPTIONS"],
    ["GET", "/api/contact", "POST, OPTIONS"],
    ["GET", "/api/v1/contact", "POST, OPTIONS"],
    ["DELETE", "/api/posts/coin-change-problem", "GET, HEAD, OPTIONS"],
    ["POST", "/openapi.json", "GET, HEAD, OPTIONS"]
  ])("405s %s %s and allows %s", async (method, path, allow) => {
    const res = await fetchWorker(path, { method });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe(allow);
    const error = await errorBody(res);
    expect(error.code).toBe("method_not_allowed");
    expect(error.message).toBe(`${method} is not supported on ${path}.`);
  });

  it("answers an unexpected failure with the documented JSON 500 and the API headers", async () => {
    const failure = new Error("store unreachable");
    const layer = appLayer(
      Layer.succeed(PostsRepository, {
        all: Effect.die(failure),
        findBySlug: () => Effect.die(failure)
      })
    );
    const logged = capturedErrors();
    const res = await apiClient({ layer }).api.v1.posts[":slug"].$get({
      param: { slug: "coin-change-problem" }
    });
    expect(res.status).toBe(500);
    expect(res.headers.get("API-Version")).toBe("1.0.0");
    expect(await errorBody(res)).toMatchObject({
      code: "internal_error",
      message: "The server failed while answering this request."
    });
    expect(logged).toHaveBeenCalledWith(
      "api request failed",
      "GET",
      "/api/v1/posts/coin-change-problem",
      failure
    );
  });

  it("answers a failure that isn't an Error on the unversioned alias with the JSON 500", async () => {
    const layer = appLayer(
      Layer.succeed(PostsRepository, {
        all: Effect.die("store unreachable"),
        findBySlug: () => Effect.die("store unreachable")
      })
    );
    capturedErrors();
    const res = await apiClient({ layer }).api.posts.$get({ query: {} });
    expect(res.status).toBe(500);
    expect(res.headers.get("API-Version")).toBe("1.0.0");
    expect(await errorBody(res)).toMatchObject({ code: "internal_error" });
  });

  it("answers a CORS preflight", async () => {
    const res = await fetchWorker("/api/contact", {
      method: "OPTIONS",
      headers: { Origin: "https://agent.example", "Access-Control-Request-Method": "POST" }
    });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});

describe("POST /api/contact", () => {
  const valid = {
    email: "ada@example.com",
    message: "A perfectly valid message body."
  };

  it("accepts a valid message and emails it to the inbox", async () => {
    const { email, sent } = recordingEmail();
    const res = await apiClient({ ip: "203.0.113.10", env: { email } }).api.contact.$post({
      json: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        company: "Analytical Engines",
        message: "We are hiring a senior backend engineer for a data platform."
      }
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({
      status: "accepted",
      message: "Message accepted. Murugappan will reply to the address you gave."
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("inbox@example.com");
    expect(sent[0].subject).toContain("Ada Lovelace");
    expect(sent[0].text).toContain("senior backend engineer");
  });

  it("rejects a non-JSON content type with 415", async () => {
    const res = await fetchWorker("/api/contact", {
      method: "POST",
      ip: "203.0.113.11",
      headers: { "Content-Type": "text/plain" },
      body: "hello"
    });
    expect(res.status).toBe(415);
    expect((await errorBody(res)).code).toBe("unsupported_media_type");
  });

  it("rejects a malformed JSON body with 400", async () => {
    const res = await fetchWorker("/api/contact", {
      method: "POST",
      ip: "203.0.113.12",
      headers: { "Content-Type": "application/json" },
      body: "{not json"
    });
    expect(res.status).toBe(400);
    expect((await errorBody(res)).code).toBe("invalid_request");
  });

  it("rejects invalid fields with 422 and names each one", async () => {
    const res = await apiClient({ ip: "203.0.113.13" }).api.contact.$post({
      json: { email: "nope", message: "hi" }
    });
    expect(res.status).toBe(422);
    const error = await errorBody(res);
    expect(error.code).toBe("invalid_request");
    expect(error.details).toEqual([
      { field: "email", issue: "must be a valid email address" },
      { field: "message", issue: "must be between 20 and 4000 characters" }
    ]);
  });

  it("rejects an oversized body with 413", async () => {
    const res = await apiClient({ ip: "203.0.113.14" }).api.contact.$post({
      json: { email: "ada@example.com", message: "x".repeat(40_000) }
    });
    expect(res.status).toBe(413);
    expect((await errorBody(res)).code).toBe("payload_too_large");
  });

  it("checks the size before the Content-Type", async () => {
    const res = await fetchWorker("/api/contact", {
      method: "POST",
      ip: "203.0.113.17",
      headers: { "Content-Type": "text/plain" },
      body: "x".repeat(40_000)
    });
    expect(res.status).toBe(413);
    expect((await errorBody(res)).code).toBe("payload_too_large");
  });

  it("405s an oversized body sent with the wrong method", async () => {
    const res = await fetchWorker("/api/contact", { method: "PUT", body: "x".repeat(40_000) });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
  });

  it("rejects an oversized streamed body that declares no length", async () => {
    const chunk = new TextEncoder().encode("x".repeat(8 * 1024));
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 3) controller.enqueue(chunk);
        else controller.close();
      }
    });
    const res = await fetchWorker("/api/contact", {
      method: "POST",
      ip: "203.0.113.16",
      headers: { "Content-Type": "application/json" },
      body
    });
    expect(res.status).toBe(413);
    expect((await errorBody(res)).code).toBe("payload_too_large");
  });

  it("answers 503 when no inbox is configured, without spending the client's slot", async () => {
    const res = await apiClient({ ip: "203.0.113.15", env: { inbox: "" } }).api.contact.$post({
      json: valid
    });
    expect(res.status).toBe(503);
    expect((await errorBody(res)).code).toBe("service_unavailable");

    const sent = await apiClient({ ip: "203.0.113.15" }).api.contact.$post({ json: valid });
    expect(sent.status).toBe(202);
    expect(sent.headers.get("X-RateLimit-Remaining")).toBe("2");
  });

  it("answers 503 when the email send fails", async () => {
    const res = await apiClient({
      ip: "203.0.113.16",
      env: { email: { send: () => Promise.reject(new Error("relay down")) } }
    }).api.contact.$post({ json: valid });
    expect(res.status).toBe(503);
    expect((await errorBody(res)).code).toBe("service_unavailable");
  });

  it("answers 429 and sends nothing once the site-wide allowance is spent", async () => {
    const layer = fakeContactQuota({
      take: () =>
        Effect.fail(
          new ContactLimitReached({
            scope: "global",
            usage: { clientRemaining: 3, globalRemaining: 0 }
          })
        )
    });
    const { email, sent } = recordingEmail();
    const res = await apiClient({ ip: "203.0.113.19", env: { email }, layer }).api.contact.$post({
      json: valid
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(await errorBody(res)).toMatchObject({
      code: "rate_limited",
      message: "The site-wide daily message allowance is spent."
    });
    expect(sent).toEqual([]);
  });

  it.each([false, true])(
    "answers 503 and sends nothing when the quota can't be checked (dryRun: %s)",
    async dryRun => {
      const failure = new Error("limiter down");
      const unavailable = () => Effect.fail(new QuotaUnavailable({ cause: failure }));
      const layer = fakeContactQuota(dryRun ? { usage: unavailable } : { take: unavailable });
      const logged = capturedErrors();
      const { email, sent } = recordingEmail();
      const res = await apiClient({ ip: "203.0.113.18", env: { email }, layer }).api.contact.$post({
        json: { ...valid, dryRun }
      });
      expect(res.status).toBe(503);
      expect(await errorBody(res)).toMatchObject({
        code: "service_unavailable",
        message: "The daily message allowance could not be checked right now."
      });
      expect(logged).toHaveBeenCalledWith("contact rate limiter failed", failure);
      expect(sent).toEqual([]);
    }
  );
});

describe("POST /api/contact with dryRun", () => {
  const body = {
    email: "ada@example.com",
    message: "A perfectly valid message body for the dry run.",
    dryRun: true
  };

  it("validates without sending an email", async () => {
    const { email, sent } = recordingEmail();
    const res = await apiClient({ ip: "198.51.100.20", env: { email } }).api.contact.$post({
      json: body
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "validated",
      message: "The request is valid. Send it again without dryRun to deliver it."
    });
    expect(sent).toEqual([]);
  });

  it("still reports invalid fields", async () => {
    const res = await apiClient({ ip: "198.51.100.22" }).api.contact.$post({
      json: { email: "nope", message: "hi", dryRun: true }
    });
    expect(res.status).toBe(422);
  });

  it("validates even when no inbox is configured", async () => {
    const res = await apiClient({ ip: "198.51.100.23", env: { inbox: "" } }).api.contact.$post({
      json: body
    });
    expect(res.status).toBe(200);
  });
});
