import { describe, expect, it } from "vitest";
import { z } from "zod";

import { API_PATHS, CURRENT_API_VERSION } from "#contracts/api/routes.ts";
import {
  fetchWorker,
  POST_MARKDOWN,
  readJson,
  recordingEmail,
  type FetchOptions,
  type TestEnvOptions
} from "./fixtures";

const get = (path: string, env?: TestEnvOptions) => fetchWorker(path, { env });

const post = (
  path: string,
  body: unknown,
  { contentType = "application/json", ...options }: FetchOptions & { contentType?: string } = {}
) =>
  fetchWorker(path, {
    ...options,
    method: "POST",
    headers: { "Content-Type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });

const PostList = z.object({ posts: z.array(z.object({ slug: z.string() })), count: z.number() });

async function errorBody(res: Response) {
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
    const res = await get("/api/profile");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toMatch(/max-age=\d+/);
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

  it("answers 503 with a hint when the dataset is not deployed", async () => {
    const res = await get("/api/profile", {
      assets: { "/api/dataset.json": null }
    });
    expect(res.status).toBe(503);
    const error = await errorBody(res);
    expect(error.code).toBe("service_unavailable");
    expect(error.hint).toContain("retry");
    expect(error.documentation_url).toBe("https://murugappan.dev/developers/");
  });

  it("answers 503 when the dataset is present but malformed", async () => {
    const res = await get("/api/profile", {
      assets: { "/api/dataset.json": '{"person":{}}' }
    });
    expect(res.status).toBe(503);
    expect((await errorBody(res)).code).toBe("service_unavailable");
  });
});

describe("path versioning", () => {
  it.each([
    ["/profile", "person"],
    ["/experience", "experience"],
    ["/skills", "skills"],
    ["/education", "education"],
    ["/open-source", "openSource"],
    ["/posts", "posts"],
    ["/posts/coin-change-problem", "markdown"]
  ])(
    "serves %s under the versioned prefix and the same body under the alias",
    async (endpoint, key) => {
      const versioned = await get(`/api/${CURRENT_API_VERSION}${endpoint}`);
      expect(versioned.status).toBe(200);
      const text = await versioned.text();
      expect(JSON.parse(text)).toHaveProperty(key);
      expect(await (await get(`/api${endpoint}`)).text()).toBe(text);
    }
  );

  it("serves the version catalogue under both prefixes", async () => {
    for (const path of [API_PATHS.versions, "/api/versions"]) {
      const res = await get(path);
      expect(res.status, path).toBe(200);
      const body = await readJson(res, z.object({ current: z.string() }));
      expect(body.current, path).toBe("v1");
    }
  });

  it("stamps the version and discovery headers on every response", async () => {
    for (const path of [
      "/api/v1/profile",
      "/api/profile",
      "/api/v1/versions",
      "/api/nope",
      "/openapi.json"
    ]) {
      const res = await get(path);
      expect(res.headers.get("API-Version"), path).toBe("1.0.0");
      expect(res.headers.get("API-Supported-Versions"), path).toBe("v1");
      expect(res.headers.get("Link"), path).toContain('rel="version-history"');
    }
  });

  it("exposes the signalling headers to a browser client", async () => {
    const res = await fetchWorker("/api/v1/profile", {
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

describe("GET /api/posts", () => {
  it("lists every post with a count", async () => {
    const res = await get("/api/posts");
    expect(res.status).toBe(200);
    const body = await readJson(res, PostList);
    expect(body.count).toBe(2);
    expect(body.posts.map(p => p.slug)).toEqual([
      "cloud-agnostic-rate-limiting",
      "coin-change-problem"
    ]);
  });

  it("filters case-insensitively on title and summary", async () => {
    const res = await get("/api/posts?q=RATE+LIMITING");
    const body = await readJson(res, PostList);
    expect(body.count).toBe(1);
    expect(body.posts[0].slug).toBe("cloud-agnostic-rate-limiting");
  });

  it("caps the list with limit", async () => {
    const res = await get("/api/posts?limit=1");
    const body = await readJson(res, PostList);
    expect(body.count).toBe(1);
  });

  it("rejects a non-numeric limit with a field-level error", async () => {
    const res = await get("/api/posts?limit=lots");
    expect(res.status).toBe(400);
    const error = await errorBody(res);
    expect(error.code).toBe("invalid_request");
    expect(error.details).toEqual([
      { field: "limit", issue: "must be an integer between 1 and 100" }
    ]);
  });

  it("rejects an out-of-range limit", async () => {
    expect((await get("/api/posts?limit=0")).status).toBe(400);
    expect((await get("/api/posts?limit=101")).status).toBe(400);
  });

  it("returns an empty list rather than an error when llms.txt is missing", async () => {
    const res = await get("/api/posts", { assets: { "/llms.txt": null } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ posts: [], count: 0 });
  });
});

describe("GET /api/posts/{slug}", () => {
  it("returns the post with its markdown source", async () => {
    const res = await get("/api/posts/coin-change-problem");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      slug: "coin-change-problem",
      title: "Coin Change Problem",
      url: "https://murugappan.dev/blog/coin-change-problem/",
      description: "Find minimum number of coins.",
      markdown: POST_MARKDOWN
    });
  });

  it("404s a slug that is not published, pointing at the list endpoint", async () => {
    const res = await get("/api/posts/no-such-post");
    expect(res.status).toBe(404);
    const error = await errorBody(res);
    expect(error.code).toBe("not_found");
    expect(error.hint).toContain("/api/posts");
  });

  it("404s a slug whose markdown rendition is missing", async () => {
    const res = await get("/api/posts/cloud-agnostic-rate-limiting");
    expect(res.status).toBe(404);
    expect((await errorBody(res)).code).toBe("not_found");
  });

  it("404s a path-traversal attempt as JSON", async () => {
    const res = await get("/api/posts/..%2F..%2Fllms.txt");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
  });
});

describe("the OpenAPI spec", () => {
  it.each(["/openapi.json", "/api/openapi.json"])("is served at %s", async path => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
    expect((await readJson(res, z.object({ openapi: z.string() }))).openapi).toBe("3.1.0");
  });

  // The server URL follows the host that was asked, upgraded to https except
  // on a local dev origin, where https would make the spec unusable.
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
      const res = await get(path);
      expect(res.status).toBe(404);
      expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
      const error = await errorBody(res);
      expect(error.code).toBe("not_found");
      expect(error.message).toContain(path);
      expect(error.hint).toContain("/openapi.json");
      expect(error.documentation_url).toBe("https://murugappan.dev/developers/");
    }
  );

  it("404s the internal dataset artifact rather than serving it raw", async () => {
    const res = await get("/api/dataset.json");
    expect(res.status).toBe(404);
    expect((await errorBody(res)).code).toBe("not_found");
  });

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
    const res = await post(
      "/api/contact",
      {
        name: "Ada Lovelace",
        email: "ada@example.com",
        company: "Analytical Engines",
        message: "We are hiring a senior backend engineer for a data platform."
      },
      {
        ip: "203.0.113.10",
        env: { email }
      }
    );
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
    const res = await post("/api/contact", "hello", {
      contentType: "text/plain",
      ip: "203.0.113.11"
    });
    expect(res.status).toBe(415);
    expect((await errorBody(res)).code).toBe("unsupported_media_type");
  });

  it("rejects a malformed JSON body with 400", async () => {
    const res = await post("/api/contact", "{not json", { ip: "203.0.113.12" });
    expect(res.status).toBe(400);
    expect((await errorBody(res)).code).toBe("invalid_request");
  });

  it("rejects invalid fields with 422 and names each one", async () => {
    const res = await post(
      "/api/contact",
      { email: "nope", message: "hi" },
      { ip: "203.0.113.13" }
    );
    expect(res.status).toBe(422);
    const error = await errorBody(res);
    expect(error.code).toBe("invalid_request");
    expect(error.details).toEqual([
      { field: "email", issue: "must be a valid email address" },
      { field: "message", issue: "must be between 20 and 4000 characters" }
    ]);
  });

  it("rejects an oversized body with 413", async () => {
    const res = await post(
      "/api/contact",
      { email: "ada@example.com", message: "x".repeat(40_000) },
      { ip: "203.0.113.14" }
    );
    expect(res.status).toBe(413);
    expect((await errorBody(res)).code).toBe("payload_too_large");
  });

  it("checks the size before the Content-Type", async () => {
    const res = await post("/api/contact", "x".repeat(40_000), {
      contentType: "text/plain",
      ip: "203.0.113.17"
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

  it("answers 503 when no inbox is configured", async () => {
    const res = await post("/api/contact", valid, { ip: "203.0.113.15", env: { inbox: "" } });
    expect(res.status).toBe(503);
    expect((await errorBody(res)).code).toBe("service_unavailable");
  });

  it("answers 503 when the email send fails", async () => {
    const res = await post("/api/contact", valid, {
      ip: "203.0.113.16",
      env: { email: { send: () => Promise.reject(new Error("relay down")) } }
    });
    expect(res.status).toBe(503);
    expect((await errorBody(res)).code).toBe("service_unavailable");
  });
});

describe("POST /api/contact with dryRun", () => {
  const body = {
    email: "ada@example.com",
    message: "A perfectly valid message body for the dry run.",
    dryRun: true
  };

  it("validates without sending an email", async () => {
    const { email, sent } = recordingEmail();
    const res = await post("/api/contact", body, { ip: "198.51.100.20", env: { email } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "validated",
      message: "The request is valid. Send it again without dryRun to deliver it."
    });
    expect(sent).toEqual([]);
  });

  it("still reports invalid fields", async () => {
    const res = await post(
      "/api/contact",
      { email: "nope", message: "hi", dryRun: true },
      { ip: "198.51.100.22" }
    );
    expect(res.status).toBe(422);
  });

  it("validates even when no inbox is configured", async () => {
    const res = await post("/api/contact", body, { ip: "198.51.100.23", env: { inbox: "" } });
    expect(res.status).toBe(200);
  });
});
