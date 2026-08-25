// The public HTTP API. The Worker claims /api/* and /openapi.json ahead of
// static assets (run_worker_first in wrangler.jsonc) for two reasons: so that
// every failure under /api is the JSON `Error` envelope rather than the HTML
// 404 page an agent cannot parse, and so the OpenAPI document can name the
// host that actually answered.
//
// Data comes from the site's own build artifacts (see store.ts) — there is no
// second copy of the profile anywhere in this directory.

import {Hono} from "hono";
import {cors} from "hono/cors";

import {sendContactEmail, type EmailLike} from "../email";
import {CONTACT_DAILY_PER_CLIENT, parseContactRequest} from "./contact";
import {apiError, type FieldIssue} from "./errors";
import {apiHeaders} from "./middleware";
import {buildOpenApiDocument} from "./openapi";
import {
  contactRateLimitHeaders,
  RATE_LIMIT_EXPOSED_HEADERS,
  secondsUntilUtcMidnight
} from "./ratelimit";
import {ALLOWED_METHODS, API_PATHS, matchApiPath} from "./routes";
import {loadDataset, loadPostMarkdown, loadPosts} from "./store";
import {buildVersionsDocument, META_EXPOSED_HEADERS} from "./versioning";

// Read responses are pure functions of the deployed build, so they are safe to
// cache; five minutes keeps a redeploy visible quickly.
const READ_CACHE = "public, max-age=300";
const MAX_CONTACT_BODY_BYTES = 16 * 1024;
const POSTS_LIMIT_MAX = 100;

const SPEC_HINT =
  "Fetch https://murugappan.dev/openapi.json for the full list of endpoints.";

function json(data: unknown, cache = READ_CACHE): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cache
    }
  });
}

const datasetUnavailable = () =>
  apiError({
    status: 503,
    code: "service_unavailable",
    message: "The site's content dataset is not available right now.",
    hint: "This is a transient deployment state — retry in a minute. If it persists, the site's /api/dataset.json build artifact is missing."
  });

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * The origin to name in a self-describing document. The scheme is forced to
 * https for any real host: Cloudflare redirects http at the edge, so
 * advertising it would hand clients a URL that only ever redirects. Local dev
 * keeps whatever scheme it was reached on.
 */
export function publicOrigin(requestUrl: string): string {
  const url = new URL(requestUrl);
  if (!LOCAL_HOSTS.has(url.hostname)) url.protocol = "https:";
  return url.origin;
}

// The methods a client may use, including the two every endpoint answers.
function allowHeader(path: string): string {
  const declared = ALLOWED_METHODS[path] ?? ["GET"];
  return [
    ...declared,
    ...(declared.includes("GET") ? ["HEAD"] : []),
    "OPTIONS"
  ].join(", ");
}

/**
 * A successful contact response, carrying what is left of the daily allowance.
 * Never cached: the body confirms a side effect and the headers are a snapshot.
 */
function contactResponse(
  status: 200 | 202,
  body: {status: string; message: string},
  usage: {clientRemaining: number; globalRemaining: number}
): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...contactRateLimitHeaders({
        ...usage,
        resetSeconds: secondsUntilUtcMidnight()
      })
    }
  });
}

export const api = new Hono<{Bindings: Env}>();

api.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "HEAD", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    // Without this a browser-side agent can read the body but none of the
    // signalling headers, which is exactly the half it needs to self-throttle.
    exposeHeaders: [...RATE_LIMIT_EXPOSED_HEADERS, ...META_EXPOSED_HEADERS],
    maxAge: 86400
  })
);

api.use("*", apiHeaders({enforceReads: true}));

const READ: string[] = ["GET", "HEAD"];

api.on(READ, "/profile", async c => {
  const data = await loadDataset(c.env.ASSETS);
  if (!data) return datasetUnavailable();
  return json({person: data.person, links: data.links});
});

api.on(READ, "/experience", async c => {
  const data = await loadDataset(c.env.ASSETS);
  if (!data) return datasetUnavailable();
  return json({experience: data.experience});
});

api.on(READ, "/skills", async c => {
  const data = await loadDataset(c.env.ASSETS);
  if (!data) return datasetUnavailable();
  return json({skills: data.skills, proficiencies: data.proficiencies});
});

api.on(READ, "/education", async c => {
  const data = await loadDataset(c.env.ASSETS);
  if (!data) return datasetUnavailable();
  return json({education: data.education});
});

api.on(READ, "/open-source", async c => {
  const data = await loadDataset(c.env.ASSETS);
  if (!data) return datasetUnavailable();
  return json({openSource: data.openSource});
});

api.on(READ, "/posts", async c => {
  const rawLimit = c.req.query("limit");
  let limit: number | undefined;
  if (rawLimit !== undefined) {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > POSTS_LIMIT_MAX) {
      return apiError({
        status: 400,
        code: "invalid_request",
        message: "The limit query parameter is out of range.",
        hint: `Pass an integer between 1 and ${POSTS_LIMIT_MAX}, or omit limit to get every post.`,
        details: [
          {
            field: "limit",
            issue: `must be an integer between 1 and ${POSTS_LIMIT_MAX}`
          }
        ]
      });
    }
    limit = parsed;
  }

  const query = c.req.query("q")?.trim().toLowerCase();
  let posts = await loadPosts(c.env.ASSETS);
  if (query) {
    posts = posts.filter(
      p =>
        p.title.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query)
    );
  }
  if (limit !== undefined) posts = posts.slice(0, limit);
  return json({posts, count: posts.length});
});

api.on(READ, "/posts/:slug", async c => {
  const slug = c.req.param("slug");
  const notFound = () =>
    apiError({
      status: 404,
      code: "not_found",
      message: `No published post has the slug '${slug}'.`,
      hint: "Call GET /api/posts to list the slugs that exist."
    });

  const post = (await loadPosts(c.env.ASSETS)).find(p => p.slug === slug);
  if (!post) return notFound();
  const markdown = await loadPostMarkdown(c.env.ASSETS, slug);
  if (markdown === null) return notFound();
  return json({...post, markdown});
});

// Version and deprecation metadata. Served under both prefixes, so a client
// that knows no version yet can still ask which ones exist.
api.on(READ, "/versions", c =>
  json(buildVersionsDocument(publicOrigin(c.req.url)))
);

api.on(READ, "/openapi.json", c => specResponse(c.req.url));

api.post("/contact", async c => {
  const contentType = c.req.header("Content-Type") ?? "";
  if (!contentType.split(";")[0].trim().endsWith("/json")) {
    return apiError({
      status: 415,
      code: "unsupported_media_type",
      message: "This endpoint only accepts a JSON request body.",
      hint: "Send Content-Type: application/json with a JSON object body."
    });
  }

  // Content-Length is the cheap check, but it is advisory — a chunked or
  // header-less request still has to be measured after reading.
  const tooLarge = (bytes: number) =>
    bytes > MAX_CONTACT_BODY_BYTES
      ? apiError({
          status: 413,
          code: "payload_too_large",
          message: "The request body is larger than this endpoint accepts.",
          hint: `Keep the whole JSON body under ${MAX_CONTACT_BODY_BYTES} bytes — see the ContactRequest schema for the per-field limits.`
        })
      : null;

  const declared = tooLarge(Number(c.req.header("Content-Length") ?? "0"));
  if (declared) return declared;

  const raw = await c.req.text();
  const measured = tooLarge(new TextEncoder().encode(raw).byteLength);
  if (measured) return measured;

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return apiError({
      status: 400,
      code: "invalid_request",
      message: "The request body could not be parsed as JSON.",
      hint: "Send a well-formed JSON object matching the ContactRequest schema."
    });
  }

  const parsed = parseContactRequest(body);
  if (!parsed.ok) {
    return apiError({
      status: 422,
      code: "invalid_request",
      message: "One or more fields in the request body are invalid.",
      hint: "Correct the fields listed in details and send the request again.",
      details: parsed.issues as FieldIssue[]
    });
  }

  const limiter = c.env.RateLimiter.get(c.env.RateLimiter.idFromName("global"));
  const clientIp = c.req.header("CF-Connecting-IP") ?? "unknown";

  if (parsed.dryRun) {
    // A dry run spends nothing, which is exactly why it has to report the
    // allowance honestly: it is how a client sizes a real send.
    const usage = await limiter.contactUsage(clientIp);
    return contactResponse(
      200,
      {
        status: "validated",
        message:
          "The request is valid. Send it again without dryRun to deliver it."
      },
      usage
    );
  }

  const inbox = c.env.OPPORTUNITY_INBOX?.trim();
  const email = c.env.EMAIL as unknown as EmailLike | undefined;
  if (!inbox || !email) {
    return apiError({
      status: 503,
      code: "service_unavailable",
      message: "Message delivery is not configured on this deployment.",
      hint: "Use one of the contact links in GET /api/profile instead."
    });
  }

  // A slot is only spent once the request is known to be well-formed and
  // deliverable, so a confused caller retrying a bad body is not locked out.
  const slot = await limiter.takeContactSlot(clientIp);
  if (!slot.allowed) {
    return apiError({
      status: 429,
      code: "rate_limited",
      message:
        slot.scope === "client"
          ? `This client has already sent ${CONTACT_DAILY_PER_CLIENT} messages today.`
          : "The site-wide daily message allowance is spent.",
      hint: `The allowance resets at 00:00 UTC — the Retry-After and RateLimit headers on this response say when and how much. For anything urgent, use the email link in GET ${API_PATHS.profile}.`,
      headers: {
        "Retry-After": String(secondsUntilUtcMidnight()),
        ...contactRateLimitHeaders({
          ...slot,
          resetSeconds: secondsUntilUtcMidnight()
        })
      }
    });
  }

  try {
    await sendContactEmail(email, inbox, parsed.value);
  } catch (err) {
    console.error("contact email failed", err);
    return apiError({
      status: 503,
      code: "service_unavailable",
      message: "The message could not be delivered right now.",
      hint: "Retry in a few minutes, or use the email link in GET /api/profile."
    });
  }

  return contactResponse(
    202,
    {
      status: "accepted",
      message:
        "Message accepted — Murugappan will reply to the address you gave."
    },
    slot
  );
});

// Anything else under /api: a known path reached with the wrong method is a
// 405 that names the methods that do work; everything else is a 404 that
// points at the spec. Neither ever falls through to the HTML 404 page.
api.all("*", c => {
  const pathname = new URL(c.req.url).pathname;
  const known = matchApiPath(pathname);
  if (known) {
    return apiError({
      status: 405,
      code: "method_not_allowed",
      message: `${c.req.method} is not supported on ${known}.`,
      hint: `Use ${allowHeader(known)} on this path instead.`,
      headers: {Allow: allowHeader(known)}
    });
  }
  return apiError({
    status: 404,
    code: "not_found",
    message: `There is no API endpoint at ${pathname}.`,
    hint: SPEC_HINT
  });
});

/** The OpenAPI document, with `servers` set to the host that was asked. */
export function specResponse(requestUrl: string): Response {
  return json(buildOpenApiDocument(publicOrigin(requestUrl)));
}

// /openapi.json is the canonical, root-level spec location agents probe first;
// it lives outside /api so it gets its own tiny app to mount.
export const specRoutes = new Hono<{Bindings: Env}>();

specRoutes.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "HEAD", "OPTIONS"],
    exposeHeaders: [...RATE_LIMIT_EXPOSED_HEADERS, ...META_EXPOSED_HEADERS],
    maxAge: 86400
  })
);

// The document describing the API must stay reachable even for a client that
// has just been throttled, so the ceiling is advertised here but not enforced.
specRoutes.use("*", apiHeaders({enforceReads: false}));

specRoutes.on(READ, "/", c => specResponse(c.req.url));

specRoutes.all("*", c =>
  apiError({
    status: 405,
    code: "method_not_allowed",
    message: `${c.req.method} is not supported on ${API_PATHS.openapiRoot}.`,
    hint: `Use ${allowHeader(API_PATHS.openapiRoot)} on this path instead.`,
    headers: {Allow: allowHeader(API_PATHS.openapiRoot)}
  })
);
