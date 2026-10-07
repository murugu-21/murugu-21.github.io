// Parses a contact request body into the message or the field issues to report.

import type { FieldIssue } from "#contracts/api/errors.ts";
import { ContactRequest, type ContactMessage } from "#contracts/api/contact.ts";

type ContactParseResult =
  // `dryRun` sits beside the payload so the email formatter never sees it.
  { ok: true; value: ContactMessage; dryRun: boolean } | { ok: false; issues: FieldIssue[] };

export function parseContactRequest(raw: unknown): ContactParseResult {
  const parsed = ContactRequest.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(issue => ({
        field: issue.path.length > 0 ? String(issue.path[0]) : "body",
        issue: issue.message
      }))
    };
  }
  const { dryRun, ...value } = parsed.data;
  return { ok: true, dryRun, value };
}
