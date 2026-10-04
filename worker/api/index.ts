// The public HTTP API. The Worker claims /api/* and /openapi.json ahead of static assets
// (run_worker_first) so failures are JSON and the spec can name the host that answered.

import { Hono, type Context } from "hono";
import { cors } from "hono/cors";

import { contactMailer, sendContactEmail } from "../email";
import { CONTACT_DAILY_PER_CLIENT, parseContactRequest } from "./contact";
import type { Dataset } from "./dataset";
import { apiError } from "./errors";
import { apiHeaders } from "./middleware";
import { buildOpenApiDocument } from "./openapi";
import { isPostsLimit, POSTS_LIMIT_MAX, searchPosts } from "./posts";
import {
  contactRateLimitHeaders,
  globalLimiter,
  RATE_LIMIT_EXPOSED_HEADERS,
  secondsUntilUtcMidnight
} from "./ratelimit";
import { ALLOWED_METHODS, API_PATHS, type ApiPath, matchApiPath, READ_METHODS } from "./routes";
import { loadDataset, loadPost, loadPosts } from "./store";
import { buildVersionsDocument, META_EXPOSED_HEADERS } from "./versioning";

// Reads depend only on the deployed build; five minutes keeps a redeploy visible quickly.
const READ_CACHE = "public, max-age=300";
const MAX_CONTACT_BODY_BYTES = 16 * 1024;

const SPEC_HINT = "Fetch https://murugappan.dev/openapi.json for the full list of endpoints.";

function json(data: unknown): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": READ_CACHE
    }
  });
}

const datasetUnavailable = () =>
  apiError({
    status: 503,
    code: "service_unavailable",
    message: "The site's content dataset is not available right now.",
    hint: "This is a transient deployment state, so retry in a minute. If it persists, the site's /api/dataset.json build artifact is missing."
  });

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Forces https for real hosts, since Cloudflare redirects http at the edge. */
export function publicOrigin(requestUrl: string): string {
  const url = new URL(requestUrl);
  if (!LOCAL_HOSTS.has(url.hostname)) url.protocol = "https:";
  return url.origin;
}

// Adds HEAD for GET endpoints and OPTIONS for all.
function allowHeader(path: ApiPath): string {
  const declared = ALLOWED_METHODS[path];
  return [...declared, ...(declared.includes("GET") ? ["HEAD"] : []), "OPTIONS"].join(", ");
}

/** Never cached: the body confirms a side effect and the headers are a snapshot. */
function contactResponse(
  status: 200 | 202,
  body: { status: string; message: string },
  usage: { clientRemaining: number; globalRemaining: number }
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

export const api = new Hono<{ Bindings: Env }>();

api.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "HEAD", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    // A browser-side agent needs the signalling headers to self-throttle.
    exposeHeaders: [...RATE_LIMIT_EXPOSED_HEADERS, ...META_EXPOSED_HEADERS],
    maxAge: 86400
  })
);

api.use("*", apiHeaders({ enforceReads: true }));

const datasetRoute =
  <T>(project: (data: Dataset) => T) =>
  async (c: Context<{ Bindings: Env }>) => {
    const data = await loadDataset(c.env.ASSETS);
    return data ? json(project(data)) : datasetUnavailable();
  };

api.on(
  READ_METHODS,
  "/profile",
  datasetRoute(d => ({ person: d.person, links: d.links }))
);

api.on(
  READ_METHODS,
  "/experience",
  datasetRoute(d => ({ experience: d.experience }))
);

api.on(
  READ_METHODS,
  "/skills",
  datasetRoute(d => ({ skills: d.skills, proficiencies: d.proficiencies }))
);

api.on(
  READ_METHODS,
  "/education",
  datasetRoute(d => ({ education: d.education }))
);

api.on(
  READ_METHODS,
  "/open-source",
  datasetRoute(d => ({ openSource: d.openSource }))
);

api.on(READ_METHODS, "/posts", async c => {
  const rawLimit = c.req.query("limit");
  const limit = rawLimit === undefined ? undefined : Number(rawLimit);
  if (limit !== undefined && !isPostsLimit(limit)) {
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

  const posts = searchPosts({
    posts: await loadPosts(c.env.ASSETS),
    query: c.req.query("q"),
    limit
  });
  return json({ posts, count: posts.length });
});

api.on(READ_METHODS, "/posts/:slug", async c => {
  const slug = c.req.param("slug");
  const post = await loadPost(c.env.ASSETS, slug);
  if (post) return json(post);
  return apiError({
    status: 404,
    code: "not_found",
    message: `No published post has the slug '${slug}'.`,
    hint: "Call GET /api/posts to list the slugs that exist."
  });
});

// Served under both prefixes so a client that knows no version yet can discover one.
api.on(READ_METHODS, "/versions", c => json(buildVersionsDocument(publicOrigin(c.req.url))));

api.on(READ_METHODS, "/openapi.json", c => specResponse(c.req.url));

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

  // Content-Length is advisory: chunked or header-less bodies are measured after reading.
  const tooLarge = (bytes: number) =>
    bytes > MAX_CONTACT_BODY_BYTES
      ? apiError({
          status: 413,
          code: "payload_too_large",
          message: "The request body is larger than this endpoint accepts.",
          hint: `Keep the whole JSON body under ${MAX_CONTACT_BODY_BYTES} bytes. See the ContactRequest schema for the per-field limits.`
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
      details: parsed.issues
    });
  }

  const limiter = globalLimiter(c.env);
  const clientIp = c.req.header("CF-Connecting-IP") ?? "unknown";

  if (parsed.dryRun) {
    // Reports the real allowance, which is how a client sizes a real send.
    const usage = await limiter.contactUsage(clientIp);
    return contactResponse(
      200,
      {
        status: "validated",
        message: "The request is valid. Send it again without dryRun to deliver it."
      },
      usage
    );
  }

  const mailer = contactMailer(c.env);
  if (!mailer) {
    return apiError({
      status: 503,
      code: "service_unavailable",
      message: "Message delivery is not configured on this deployment.",
      hint: "Use one of the contact links in GET /api/profile instead."
    });
  }

  // Spend a slot only after validation, so retrying a bad body cannot lock a caller out.
  const slot = await limiter.takeContactSlot(clientIp);
  if (!slot.allowed) {
    return apiError({
      status: 429,
      code: "rate_limited",
      message:
        slot.scope === "client"
          ? `This client has already sent ${CONTACT_DAILY_PER_CLIENT} messages today.`
          : "The site-wide daily message allowance is spent.",
      hint: `The allowance resets at 00:00 UTC. The Retry-After and RateLimit headers on this response say when and how much. For anything urgent, use the email link in GET ${API_PATHS.profile}.`,
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
    await sendContactEmail({ ...mailer, msg: parsed.value });
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
      message: "Message accepted. Murugappan will reply to the address you gave."
    },
    slot
  );
});

// A known path with the wrong method gets 405 with Allow.
// Anything else gets 404 pointing at the spec.
api.all("*", c => {
  const pathname = new URL(c.req.url).pathname;
  const known = matchApiPath(pathname);
  if (known) {
    return apiError({
      status: 405,
      code: "method_not_allowed",
      message: `${c.req.method} is not supported on ${known}.`,
      hint: `Use ${allowHeader(known)} on this path instead.`,
      headers: { Allow: allowHeader(known) }
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
function specResponse(requestUrl: string): Response {
  return json(buildOpenApiDocument(publicOrigin(requestUrl)));
}

// /openapi.json lives outside /api, so it gets its own app.
export const specRoutes = new Hono<{ Bindings: Env }>();

specRoutes.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "HEAD", "OPTIONS"],
    exposeHeaders: [...RATE_LIMIT_EXPOSED_HEADERS, ...META_EXPOSED_HEADERS],
    maxAge: 86400
  })
);

// A throttled client must still reach the spec, so reads are advertised but not enforced.
specRoutes.use("*", apiHeaders({ enforceReads: false }));

specRoutes.on(READ_METHODS, "/", c => specResponse(c.req.url));

specRoutes.all("*", c =>
  apiError({
    status: 405,
    code: "method_not_allowed",
    message: `${c.req.method} is not supported on ${API_PATHS.openapiRoot}.`,
    hint: `Use ${allowHeader(API_PATHS.openapiRoot)} on this path instead.`,
    headers: { Allow: allowHeader(API_PATHS.openapiRoot) }
  })
);
