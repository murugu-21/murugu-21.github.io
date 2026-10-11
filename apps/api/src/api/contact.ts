import type { FieldIssue } from "@murugappan/contracts/api/errors.ts";
import {
  CONTACT_DAILY_PER_CLIENT,
  ContactRequest,
  type ContactMessage
} from "@murugappan/contracts/api/contact.ts";
import { API_PATHS } from "@murugappan/contracts/api/routes.ts";
import type { ContactError, QuotaUnavailable } from "#src/programs/contact-delivery.ts";
import type { Render } from "#src/programs/run-in-request.ts";
import type { ContactUsage } from "#src/rate-limiter.ts";
import { apiError, fieldIssues } from "./errors";
import { contactRateLimitHeaders, secondsUntilUtcMidnight } from "./ratelimit";

type ContactParseResult =
  // `dryRun` sits beside the payload so the email formatter never sees it.
  { ok: true; value: ContactMessage; dryRun: boolean } | { ok: false; issues: FieldIssue[] };

export function parseContactRequest(raw: unknown): ContactParseResult {
  const parsed = ContactRequest.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: fieldIssues(parsed.error) };
  const { dryRun, ...value } = parsed.data;
  return { ok: true, dryRun, value };
}

/** Never cached: the body confirms a side effect and the headers are a snapshot. */
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

export const dryRunResponse: Render<ContactUsage, QuotaUnavailable, Response> = {
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

export const deliveryResponses: Render<ContactUsage, ContactError, Response> = {
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
