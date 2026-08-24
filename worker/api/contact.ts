// Validation for POST /api/contact — the one write endpoint on the API. It is
// the HTTP equivalent of the capture_opportunity tool Jarvis already calls
// over the chat socket, so an agent that cannot open a WebSocket can still
// reach Murugappan. Every rejection names the offending fields so a
// function-calling model can repair its own arguments and retry.

// Two-tier daily allowance, enforced by the RateLimiter Durable Object. Both
// tiers are deliberately small: the endpoint exists so an agent can pass along
// one genuine opportunity, not so it can be used as a mailer.
export const CONTACT_DAILY_GLOBAL = 20;
export const CONTACT_DAILY_PER_CLIENT = 3;

export const CONTACT_LIMITS = {
  name: 120,
  email: 254,
  company: 120,
  message: {min: 20, max: 4000}
} as const;

export type ContactRequest = {
  name?: string;
  email: string;
  company?: string;
  message: string;
};

export type FieldIssue = {field: string; issue: string};

export type ContactParseResult =
  // `dryRun` is a request option, not part of the message, so it is reported
  // alongside the payload rather than inside it — the email formatter never
  // has to know the flag exists.
  | {ok: true; value: ContactRequest; dryRun: boolean}
  | {ok: false; issues: FieldIssue[]};

// Deliberately loose: a local part, an "@", and a dotted domain. Anything
// stricter rejects addresses that are perfectly deliverable.
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

function optional(
  raw: unknown,
  field: "name" | "company",
  max: number,
  issues: FieldIssue[]
): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    issues.push({field, issue: "must be a string"});
    return undefined;
  }
  const value = raw.trim();
  if (value.length === 0) return undefined;
  if (value.length > max) {
    issues.push({field, issue: `must be at most ${max} characters`});
    return undefined;
  }
  return value;
}

export function parseContactRequest(raw: unknown): ContactParseResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      issues: [{field: "body", issue: "must be a JSON object"}]
    };
  }
  const body = raw as Record<string, unknown>;
  const issues: FieldIssue[] = [];

  const name = optional(body.name, "name", CONTACT_LIMITS.name, issues);

  let email: string | undefined;
  if (typeof body.email !== "string") {
    issues.push({field: "email", issue: "is required and must be a string"});
  } else {
    const trimmed = body.email.trim();
    if (!EMAIL.test(trimmed) || trimmed.length > CONTACT_LIMITS.email) {
      issues.push({field: "email", issue: "must be a valid email address"});
    } else {
      email = trimmed;
    }
  }

  const company = optional(
    body.company,
    "company",
    CONTACT_LIMITS.company,
    issues
  );

  // The sandbox for the one write endpoint: validate the exact payload an
  // agent is about to send, with no email and no rate-limit slot spent.
  let dryRun = false;
  if (body.dryRun !== undefined && body.dryRun !== null) {
    if (typeof body.dryRun !== "boolean")
      issues.push({field: "dryRun", issue: "must be a boolean"});
    else dryRun = body.dryRun;
  }

  let message: string | undefined;
  if (typeof body.message !== "string") {
    issues.push({field: "message", issue: "is required and must be a string"});
  } else {
    const trimmed = body.message.trim();
    const {min, max} = CONTACT_LIMITS.message;
    if (trimmed.length < min || trimmed.length > max) {
      issues.push({
        field: "message",
        issue: `must be between ${min} and ${max} characters`
      });
    } else {
      message = trimmed;
    }
  }

  if (issues.length > 0) return {ok: false, issues};
  return {
    ok: true,
    dryRun,
    value: {
      ...(name ? {name} : {}),
      email: email as string,
      ...(company ? {company} : {}),
      message: message as string
    }
  };
}
