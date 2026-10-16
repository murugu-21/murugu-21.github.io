import { Hono } from "hono";

import { CONTACT_DAILY_PER_CLIENT, ContactRequest } from "@murugappan/contracts/api/contact.ts";
import { API_PATHS } from "@murugappan/contracts/api/routes.ts";
import { runInRequest } from "#src/app.module.ts";
import type { AppEnv } from "#src/common/app-env.ts";
import type { Render } from "#src/common/di/render.ts";
import { apiError } from "#src/common/http/api-error.ts";
import { bodyLimitMiddleware } from "#src/common/middleware/body-limit.middleware.ts";
import { jsonBodyPipe } from "#src/common/pipes/json-body.pipe.ts";
import { ContactService, type ContactError } from "#src/modules/contact/contact.service.ts";
import type {
  ContactUsage,
  QuotaUnavailable
} from "#src/modules/rate-limit/contact-quota.repository.ts";
import {
  contactRateLimitHeaders,
  secondsUntilUtcMidnight
} from "#src/modules/rate-limit/rate-limit-headers.ts";

const MAX_CONTACT_BODY_BYTES = 16 * 1024;

function contactResponse(
  status: 200 | 202,
  body: { status: string; message: string },
  usage: ContactUsage
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

const RETRY_HINT = "Retry in a few minutes, or use the email link in GET /api/profile.";

function quotaUnavailable({ cause }: QuotaUnavailable): Response {
  console.error("contact rate limiter failed", cause);
  return apiError({
    status: 503,
    code: "service_unavailable",
    message: "The daily message allowance could not be checked right now.",
    hint: RETRY_HINT
  });
}

const dryRunResponse: Render<ContactUsage, QuotaUnavailable, Response> = {
  success: usage =>
    contactResponse(
      200,
      {
        status: "validated",
        message: "The request is valid. Send it again without dryRun to deliver it."
      },
      usage
    ),
  failures: { QuotaUnavailable: quotaUnavailable }
};

const deliveryResponses: Render<ContactUsage, ContactError, Response> = {
  success: usage =>
    contactResponse(
      202,
      {
        status: "accepted",
        message: "Message accepted. Murugappan will reply to the address you gave."
      },
      usage
    ),
  failures: {
    DeliveryNotConfigured: () =>
      apiError({
        status: 503,
        code: "service_unavailable",
        message: "Message delivery is not configured on this deployment.",
        hint: "Use one of the contact links in GET /api/profile instead."
      }),
    ContactLimitReached: ({ scope, usage }) =>
      apiError({
        status: 429,
        code: "rate_limited",
        message:
          scope === "client"
            ? `This client has already sent ${CONTACT_DAILY_PER_CLIENT} messages today.`
            : "The site-wide daily message allowance is spent.",
        hint: `The allowance resets at 00:00 UTC. The Retry-After and RateLimit headers on this response say when and how much. For anything urgent, use the email link in GET ${API_PATHS.profile}.`,
        headers: {
          "Retry-After": String(secondsUntilUtcMidnight()),
          ...contactRateLimitHeaders({
            ...usage,
            resetSeconds: secondsUntilUtcMidnight()
          })
        }
      }),
    DeliveryFailed: ({ cause }) => {
      console.error("contact email failed", cause);
      return apiError({
        status: 503,
        code: "service_unavailable",
        message: "The message could not be delivered right now.",
        hint: RETRY_HINT
      });
    },
    QuotaUnavailable: quotaUnavailable
  }
};

export const contactController = new Hono<AppEnv>().post(
  "/contact",
  bodyLimitMiddleware({ maxBytes: MAX_CONTACT_BODY_BYTES, schemaName: "ContactRequest" }),
  jsonBodyPipe({ schema: ContactRequest, schemaName: "ContactRequest" }),
  c => {
    const { dryRun, ...message } = c.var.body;
    const client = c.req.header("CF-Connecting-IP") ?? "unknown";

    if (dryRun) {
      return runInRequest({
        services: c.var.services,
        program: ContactService.use(contact => contact.usage(client)),
        render: dryRunResponse
      });
    }

    // Spend a slot only after validation, so retrying a bad body cannot lock a caller out.
    return runInRequest({
      services: c.var.services,
      program: ContactService.use(contact => contact.deliver({ client, message })),
      render: deliveryResponses
    });
  }
);
