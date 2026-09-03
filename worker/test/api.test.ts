import {env} from "cloudflare:test";
import {describe, expect, it} from "vitest";

import {DOCS_URL} from "../api/errors";
import {CONTACT_DAILY_PER_CLIENT} from "../api/contact";
import worker from "../server";
import {fakeAssets, POST_MARKDOWN} from "./fixtures";

type Options = {
  assets?: Record<string, string | null>;
  inbox?: string | null;
  email?: {send(msg: unknown): Promise<unknown>} | null;
};

function testEnv(options: Options = {}): Env {
  return {
    ...env,
    ASSETS: fakeAssets(options.assets),
    OPPORTUNITY_INBOX:
      options.inbox === undefined ? "inbox@example.com" : options.inbox,
    EMAIL:
      options.email === undefined
        ? {send: () => Promise.resolve()}
        : options.email
  } as unknown as Env;
}

async function get(path: string, options?: Options): Promise<Response> {
  return await worker.fetch(
    new Request(`https://murugappan.dev${path}`),
    testEnv(options)
  );
}

async function post(
  path: string,
  body: unknown,
  init: {ip?: string; contentType?: string | null} = {},
  options?: Options
): Promise<Response> {
  const headers: Record<string, string> = {
    "CF-Connecting-IP": init.ip ?? "203.0.113.1"
  };
  if (init.contentType !== null)
    headers["Content-Type"] = init.contentType ?? "application/json";
  return await worker.fetch(
    new Request(`https://murugappan.dev${path}`, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body)
    }),
    testEnv(options)
  );
}

async function errorBody(res: Response) {
  const body = (await res.json()) as {
    error: {
      code: string;
      message: string;
      hint: string;
      documentation_url: string;
      details?: unknown;
    };
  };
  return body.error;
}

describe("GET /api/profile", () => {
  it("returns the person and links as JSON", async () => {
    const res = await get("/api/profile");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
    const body = (await res.json()) as {
      person: {name: string; currentRole: {company: string}};
      links: Array<{label: string}>;
    };
    expect(body.person.name).toBe("Murugappan M");
    expect(body.person.currentRole.company).toBe("MedMe Health");
    expect(body.links.map(l => l.label)).toContain("OpenAPI spec");
  });

  it("allows cross-origin reads so browser agents can call it", async () => {
    const res = await get("/api/profile");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("is cacheable", async () => {
    const res = await get("/api/profile");
    expect(res.headers.get("Cache-Control")).toMatch(/max-age=\d+/);
  });

  it("answers 503 with a hint when the dataset is not deployed", async () => {
    const res = await get("/api/profile", {
      assets: {"/api/dataset.json": null}
    });
    expect(res.status).toBe(503);
    const error = await errorBody(res);
    expect(error.code).toBe("service_unavailable");
    expect(error.hint).toBeTruthy();
    expect(error.documentation_url).toBe(DOCS_URL);
  });

  it("answers 503 when the dataset is present but malformed", async () => {
    const res = await get("/api/profile", {
      assets: {"/api/dataset.json": '{"person":{}}'}
    });
    expect(res.status).toBe(503);
    expect((await errorBody(res)).code).toBe("service_unavailable");
  });
});

describe("the other read endpoints", () => {
  it("returns dated work experience", async () => {
    const body = (await (await get("/api/experience")).json()) as {
      experience: Array<{company: string; startDate: string; current: boolean}>;
    };
    expect(body.experience[0]).toMatchObject({
      company: "MedMe Health",
      startDate: "2025-12",
      current: true
    });
  });

  it("returns skills and proficiencies", async () => {
    const body = (await (await get("/api/skills")).json()) as {
      skills: Array<{category: string; skills: string[]}>;
      proficiencies: Array<{area: string; tools: string[]; level: number}>;
    };
    expect(body.skills[0].skills).toEqual(["TypeScript", "Python"]);
    expect(body.proficiencies[0]).toEqual({
      area: "Backend",
      tools: ["Node.js"],
      level: 90
    });
  });

  it("returns education", async () => {
    const body = (await (await get("/api/education")).json()) as {
      education: Array<{institution: string}>;
    };
    expect(body.education[0].institution).toBe(
      "Kumaraguru College of Technology"
    );
  });

  it("returns open-source contributions with verifiable links", async () => {
    const body = (await (await get("/api/open-source")).json()) as {
      openSource: Array<{project: string; links: Array<{url: string}>}>;
    };
    expect(body.openSource[0].project).toBe("AnkiDroid");
    expect(body.openSource[0].links[0].url).toBe("https://gh.example/1");
  });
});

describe("GET /api/posts", () => {
  it("lists every post with a count", async () => {
    const res = await get("/api/posts");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      posts: Array<{slug: string}>;
      count: number;
    };
    expect(body.count).toBe(2);
    expect(body.posts.map(p => p.slug)).toEqual([
      "cloud-agnostic-rate-limiting",
      "coin-change-problem"
    ]);
  });

  it("filters case-insensitively on title and summary", async () => {
    const body = (await (await get("/api/posts?q=RATE+LIMITING")).json()) as {
      posts: Array<{slug: string}>;
      count: number;
    };
    expect(body.count).toBe(1);
    expect(body.posts[0].slug).toBe("cloud-agnostic-rate-limiting");
  });

  it("caps the list with limit", async () => {
    const body = (await (await get("/api/posts?limit=1")).json()) as {
      count: number;
    };
    expect(body.count).toBe(1);
  });

  it("rejects a non-numeric limit with a field-level error", async () => {
    const res = await get("/api/posts?limit=lots");
    expect(res.status).toBe(400);
    const error = await errorBody(res);
    expect(error.code).toBe("invalid_request");
    expect(error.details).toEqual([
      {field: "limit", issue: "must be an integer between 1 and 100"}
    ]);
  });

  it("rejects an out-of-range limit", async () => {
    expect((await get("/api/posts?limit=0")).status).toBe(400);
    expect((await get("/api/posts?limit=101")).status).toBe(400);
  });

  it("returns an empty list rather than an error when llms.txt is missing", async () => {
    const res = await get("/api/posts", {assets: {"/llms.txt": null}});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({posts: [], count: 0});
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
  it("is served at the site root", async () => {
    const res = await get("/openapi.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
    const body = (await res.json()) as {
      openapi: string;
      servers: Array<{url: string}>;
    };
    expect(body.openapi).toBe("3.1.0");
    expect(body.servers[0].url).toBe("https://murugappan.dev");
  });

  it("is served under the API prefix too", async () => {
    const res = await get("/api/openapi.json");
    expect(res.status).toBe(200);
    expect(((await res.json()) as {openapi: string}).openapi).toBe("3.1.0");
  });

  it("reports the requesting origin as the server", async () => {
    const res = await worker.fetch(
      new Request("https://preview.example/openapi.json"),
      testEnv()
    );
    const body = (await res.json()) as {servers: Array<{url: string}>};
    expect(body.servers[0].url).toBe("https://preview.example");
  });

  it("advertises https even when the request arrived over http", async () => {
    const res = await worker.fetch(
      new Request("http://murugappan.dev/openapi.json"),
      testEnv()
    );
    const body = (await res.json()) as {servers: Array<{url: string}>};
    expect(body.servers[0].url).toBe("https://murugappan.dev");
  });

  it("leaves a local dev origin on http so the spec stays usable there", async () => {
    const res = await worker.fetch(
      new Request("http://localhost:8787/openapi.json"),
      testEnv()
    );
    const body = (await res.json()) as {servers: Array<{url: string}>};
    expect(body.servers[0].url).toBe("http://localhost:8787");
  });
});

describe("error handling under /api", () => {
  it("404s an unknown endpoint as JSON, never as the HTML 404 page", async () => {
    const res = await get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
    const error = await errorBody(res);
    expect(error.code).toBe("not_found");
    expect(error.hint).toContain("/openapi.json");
  });

  it("404s the internal dataset artifact rather than serving it raw", async () => {
    const res = await get("/api/dataset.json");
    expect(res.status).toBe(404);
    expect((await errorBody(res)).code).toBe("not_found");
  });

  it("405s a write to a read-only endpoint and says which methods work", async () => {
    const res = await post("/api/profile", {});
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
    expect((await errorBody(res)).code).toBe("method_not_allowed");
  });

  it("405s a read of the write-only endpoint", async () => {
    const res = await get("/api/contact");
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
    expect((await errorBody(res)).code).toBe("method_not_allowed");
  });

  it("answers a CORS preflight", async () => {
    const res = await worker.fetch(
      new Request("https://murugappan.dev/api/contact", {
        method: "OPTIONS",
        headers: {
          Origin: "https://agent.example",
          "Access-Control-Request-Method": "POST"
        }
      }),
      testEnv()
    );
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});

describe("POST /api/contact", () => {
  it("accepts a valid message and emails it to the inbox", async () => {
    const sent: Array<{to: string; subject: string; text: string}> = [];
    const res = await post(
      "/api/contact",
      {
        name: "Ada Lovelace",
        email: "ada@example.com",
        company: "Analytical Engines",
        message: "We are hiring a senior backend engineer for a data platform."
      },
      {ip: "203.0.113.10"},
      {
        email: {
          send: async msg => void sent.push(msg as (typeof sent)[number])
        }
      }
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({
      status: "accepted",
      message:
        "Message accepted — Murugappan will reply to the address you gave."
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
    const res = await post("/api/contact", "{not json", {ip: "203.0.113.12"});
    expect(res.status).toBe(400);
    expect((await errorBody(res)).code).toBe("invalid_request");
  });

  it("rejects invalid fields with 422 and names each one", async () => {
    const res = await post(
      "/api/contact",
      {email: "nope", message: "hi"},
      {ip: "203.0.113.13"}
    );
    expect(res.status).toBe(422);
    const error = await errorBody(res);
    expect(error.code).toBe("invalid_request");
    expect(error.details).toEqual([
      {field: "email", issue: "must be a valid email address"},
      {field: "message", issue: "must be between 20 and 4000 characters"}
    ]);
  });

  it("rejects an oversized body with 413", async () => {
    const res = await post(
      "/api/contact",
      {email: "ada@example.com", message: "x".repeat(40_000)},
      {ip: "203.0.113.14"}
    );
    expect(res.status).toBe(413);
    expect((await errorBody(res)).code).toBe("payload_too_large");
  });

  it("answers 503 when no inbox is configured", async () => {
    const res = await post(
      "/api/contact",
      {email: "ada@example.com", message: "A perfectly valid message body."},
      {ip: "203.0.113.15"},
      {inbox: null}
    );
    expect(res.status).toBe(503);
    expect((await errorBody(res)).code).toBe("service_unavailable");
  });

  it("answers 503 when the email send fails", async () => {
    const res = await post(
      "/api/contact",
      {email: "ada@example.com", message: "A perfectly valid message body."},
      {ip: "203.0.113.16"},
      {email: {send: () => Promise.reject(new Error("relay down"))}}
    );
    expect(res.status).toBe(503);
    expect((await errorBody(res)).code).toBe("service_unavailable");
  });

  it("rate-limits a client once its daily allowance is spent", async () => {
    const body = {
      email: "ada@example.com",
      message: "A perfectly valid message body for the rate limit test."
    };
    for (let i = 0; i < CONTACT_DAILY_PER_CLIENT; i++) {
      const ok = await post("/api/contact", body, {ip: "198.51.100.7"});
      expect(ok.status).toBe(202);
    }
    const res = await post("/api/contact", body, {ip: "198.51.100.7"});
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect((await errorBody(res)).code).toBe("rate_limited");
  });

  it("does not spend a rate-limit slot on an invalid request", async () => {
    for (let i = 0; i < CONTACT_DAILY_PER_CLIENT + 1; i++) {
      const res = await post(
        "/api/contact",
        {email: "nope", message: "hi"},
        {ip: "198.51.100.8"}
      );
      expect(res.status).toBe(422);
    }
    const res = await post(
      "/api/contact",
      {
        email: "ada@example.com",
        message: "A perfectly valid message body after the failures."
      },
      {ip: "198.51.100.8"}
    );
    expect(res.status).toBe(202);
  });
});

describe("POST /api/contact?dryRun", () => {
  const body = {
    email: "ada@example.com",
    message: "A perfectly valid message body for the dry run.",
    dryRun: true
  };

  it("validates without sending an email", async () => {
    const sent: unknown[] = [];
    const res = await post(
      "/api/contact",
      body,
      {ip: "198.51.100.20"},
      {
        email: {send: async msg => void sent.push(msg)}
      }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "validated",
      message:
        "The request is valid. Send it again without dryRun to deliver it."
    });
    expect(sent).toEqual([]);
  });

  it("does not spend a rate-limit slot", async () => {
    for (let i = 0; i < CONTACT_DAILY_PER_CLIENT + 2; i++) {
      const res = await post("/api/contact", body, {ip: "198.51.100.21"});
      expect(res.status).toBe(200);
    }
    const real = await post(
      "/api/contact",
      {email: body.email, message: body.message},
      {ip: "198.51.100.21"}
    );
    expect(real.status).toBe(202);
  });

  it("still reports invalid fields", async () => {
    const res = await post(
      "/api/contact",
      {email: "nope", message: "hi", dryRun: true},
      {ip: "198.51.100.22"}
    );
    expect(res.status).toBe(422);
  });

  it("validates even when no inbox is configured", async () => {
    const res = await post(
      "/api/contact",
      body,
      {ip: "198.51.100.23"},
      {
        inbox: null
      }
    );
    expect(res.status).toBe(200);
  });
});
