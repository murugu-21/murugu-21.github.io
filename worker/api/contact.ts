// Validation for POST /api/contact, the HTTP twin of Jarvis's capture_opportunity tool. Every
// rejection names its fields so a function-calling model can repair its arguments and retry.

import type { FieldIssue } from "./errors";

// Daily allowances enforced by the RateLimiter DO; small on purpose so this is not a mailer.
export const CONTACT_DAILY_GLOBAL = 20;
export const CONTACT_DAILY_PER_CLIENT = 3;

export const CONTACT_LIMITS = {
  name: 120,
  email: 254,
  company: 120,
  message: { min: 20, max: 4000 }
} as const;

export type ContactRequest = {
  name?: string;
  email: string;
  company?: string;
  message: string;
};

export type ContactParseResult =
  // `dryRun` sits beside the payload so the email formatter never sees it.
  { ok: true; value: ContactRequest; dryRun: boolean } | { ok: false; issues: FieldIssue[] };

// Deliberately loose: stricter patterns reject deliverable addresses.
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

function optional({
  raw,
  field,
  max,
  issues
}: {
  raw: unknown;
  field: "name" | "company";
  max: number;
  issues: FieldIssue[];
}): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    issues.push({ field, issue: "must be a string" });
    return undefined;
  }
  const value = raw.trim();
  if (value.length === 0) return undefined;
  if (value.length > max) {
    issues.push({ field, issue: `must be at most ${max} characters` });
    return undefined;
  }
  return value;
}

export function parseContactRequest(raw: unknown): ContactParseResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      issues: [{ field: "body", issue: "must be a JSON object" }]
    };
  }
  const body = raw as Record<string, unknown>;
  const issues: FieldIssue[] = [];

  const name = optional({ raw: body.name, field: "name", max: CONTACT_LIMITS.name, issues });

  let email: string | undefined;
  if (typeof body.email !== "string") {
    issues.push({ field: "email", issue: "is required and must be a string" });
  } else {
    const trimmed = body.email.trim();
    if (!EMAIL.test(trimmed) || trimmed.length > CONTACT_LIMITS.email) {
      issues.push({ field: "email", issue: "must be a valid email address" });
    } else {
      email = trimmed;
    }
  }

  const company = optional({
    raw: body.company,
    field: "company",
    max: CONTACT_LIMITS.company,
    issues
  });

  // Validates the payload without sending an email or spending a rate-limit slot.
  const rawDryRun = body.dryRun ?? false;
  if (typeof rawDryRun !== "boolean") issues.push({ field: "dryRun", issue: "must be a boolean" });
  const dryRun = rawDryRun === true;

  let message: string | undefined;
  if (typeof body.message !== "string") {
    issues.push({
      field: "message",
      issue: "is required and must be a string"
    });
  } else {
    const trimmed = body.message.trim();
    const { min, max } = CONTACT_LIMITS.message;
    if (trimmed.length < min || trimmed.length > max) {
      issues.push({
        field: "message",
        issue: `must be between ${min} and ${max} characters`
      });
    } else {
      message = trimmed;
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    dryRun,
    value: {
      ...(name ? { name } : {}),
      email: email as string,
      ...(company ? { company } : {}),
      message: message as string
    }
  };
}
