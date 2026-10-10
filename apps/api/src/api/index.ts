import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { methodNotAllowed } from "hono/method-not-allowed";
import type { z } from "zod";

import { contactMailer, sendContactEmail } from "#src/email.ts";
import { CONTACT_DAILY_PER_CLIENT } from "@murugappan/contracts/api/contact.ts";
import { parseContactRequest } from "./contact";
import {
  EducationList,
  ExperienceList,
  OpenSourceList,
  Profile,
  SkillsResponse
} from "@murugappan/contracts/api/dataset.ts";
import { apiError, fieldIssues } from "./errors";
import { apiHeaders } from "./middleware";
import { buildOpenApiDocument } from "./openapi";
import { PostsQuery } from "@murugappan/contracts/api/posts.ts";
import { searchPosts } from "./posts";
import {
  contactRateLimitHeaders,
  globalLimiter,
  RATE_LIMIT_EXPOSED_HEADERS,
  secondsUntilUtcMidnight
} from "./ratelimit";
import { API_PATHS, READ_METHODS } from "@murugappan/contracts/api/routes.ts";
import { DATASET, findPost, POSTS } from "#src/content.ts";
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

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Forces https for real hosts, since Cloudflare redirects http at the edge. */
export function publicOrigin(requestUrl: string): string {
  const url = new URL(requestUrl);
  if (!LOCAL_HOSTS.has(url.hostname)) url.protocol = "https:";
  return url.origin;
}

// Hono finds the methods registered for the path (HEAD with GET); CORS answers OPTIONS everywhere.
const jsonMethodNotAllowed = (app: Hono<{ Bindings: Env }>) =>
  methodNotAllowed({
    app,
    onMethodNotAllowed: (c, methods) => {
      const allow = [...methods, "OPTIONS"].join(", ");
      return apiError({
        status: 405,
        code: "method_not_allowed",
        message: `${c.req.method} is not supported on ${c.req.path}.`,
        hint: `Use ${allow} on this path instead.`,
        headers: { Allow: allow }
      });
    }
  });

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
api.use("*", jsonMethodNotAllowed(api));

// Each slice schema picks its keys from the dataset; parsing drops the rest.
const datasetRoute = (slice: z.ZodType) => () => json(slice.parse(DATASET));

api.on(READ_METHODS, "/profile", datasetRoute(Profile));

api.on(READ_METHODS, "/experience", datasetRoute(ExperienceList));

api.on(READ_METHODS, "/skills", datasetRoute(SkillsResponse));

api.on(READ_METHODS, "/education", datasetRoute(EducationList));

api.on(READ_METHODS, "/open-source", datasetRoute(OpenSourceList));

api.on(READ_METHODS, "/posts", c => {
  const parsed = PostsQuery.safeParse(c.req.query());
  if (!parsed.success) {
    return apiError({
      status: 400,
      code: "invalid_request",
      message: "One or more query parameters are invalid.",
      hint: "Correct the parameters listed in details, or omit them to get every post.",
      details: fieldIssues(parsed.error)
    });
  }

  const posts = searchPosts({
    posts: POSTS,
    query: parsed.data.q,
    limit: parsed.data.limit
  });
  return json({ posts, count: posts.length });
});

api.on(READ_METHODS, "/posts/:slug", c => {
  const slug = c.req.param("slug");
  const post = findPost(slug);
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

const contactBodyLimit = bodyLimit({
  maxSize: MAX_CONTACT_BODY_BYTES,
  onError: () =>
    apiError({
      status: 413,
      code: "payload_too_large",
      message: "The request body is larger than this endpoint accepts.",
      hint: `Keep the whole JSON body under ${MAX_CONTACT_BODY_BYTES} bytes. See the ContactRequest schema for the per-field limits.`
    })
});

api.post("/contact", contactBodyLimit, async c => {
  const contentType = c.req.header("Content-Type") ?? "";
  if (!contentType.split(";")[0].trim().endsWith("/json")) {
    return apiError({
      status: 415,
      code: "unsupported_media_type",
      message: "This endpoint only accepts a JSON request body.",
      hint: "Send Content-Type: application/json with a JSON object body."
    });
  }

  let body: unknown;
  try {
    body = JSON.parse(await c.req.text());
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

// jsonMethodNotAllowed turns this into a 405 when the path exists under another method.
api.all("*", c =>
  apiError({
    status: 404,
    code: "not_found",
    message: `There is no API endpoint at ${c.req.path}.`,
    hint: SPEC_HINT
  })
);

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
specRoutes.use("*", jsonMethodNotAllowed(specRoutes));

specRoutes.on(READ_METHODS, "/", c => specResponse(c.req.url));
