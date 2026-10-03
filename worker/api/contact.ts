// Validation for POST /api/contact, the HTTP twin of Jarvis's capture_opportunity tool. Every
// rejection names its fields so a function-calling model can repair its arguments and retry.

import { z } from "zod";

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

type ContactParseResult =
  // `dryRun` sits beside the payload so the email formatter never sees it.
  { ok: true; value: ContactRequest; dryRun: boolean } | { ok: false; issues: FieldIssue[] };

// Deliberately loose: stricter patterns reject deliverable addresses.
export const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

// Blank after trimming counts as absent.
const optionalText = (max: number) =>
  z
    .string({ error: "must be a string" })
    .trim()
    .max(max, { error: `must be at most ${max} characters` })
    .nullish()
    .transform(value => value || undefined);

const requiredText = z.string({ error: "is required and must be a string" }).trim();

const MESSAGE = CONTACT_LIMITS.message;

// Key order is the order issues are reported in.
const ContactBody = z.object(
  {
    name: optionalText(CONTACT_LIMITS.name),
    email: requiredText.refine(value => EMAIL.test(value) && value.length <= CONTACT_LIMITS.email, {
      error: "must be a valid email address"
    }),
    company: optionalText(CONTACT_LIMITS.company),
    // Validates the payload without sending an email or spending a rate-limit slot.
    dryRun: z
      .boolean({ error: "must be a boolean" })
      .nullish()
      .transform(value => value ?? false),
    message: requiredText.refine(
      value => value.length >= MESSAGE.min && value.length <= MESSAGE.max,
      { error: `must be between ${MESSAGE.min} and ${MESSAGE.max} characters` }
    )
  },
  { error: "must be a JSON object" }
);

export function parseContactRequest(raw: unknown): ContactParseResult {
  const parsed = ContactBody.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(issue => ({
        field: issue.path.length > 0 ? String(issue.path[0]) : "body",
        issue: issue.message
      }))
    };
  }
  const { dryRun, name, email, company, message } = parsed.data;
  return {
    ok: true,
    dryRun,
    value: {
      ...(name ? { name } : {}),
      email,
      ...(company ? { company } : {}),
      message
    }
  };
}
