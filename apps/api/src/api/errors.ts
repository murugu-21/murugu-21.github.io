// The one error envelope (packages/contracts/api/errors.ts) every /api/* failure answers with.

import type { z } from "zod";

import {
  DOCS_URL,
  type ApiErrorCode,
  type ErrorBody,
  type FieldIssue
} from "@murugappan/contracts/api/errors.ts";

/** One entry per zod issue, named by the top-level field it is about. */
export const fieldIssues = (error: z.ZodError): FieldIssue[] =>
  error.issues.map(issue => ({
    field: issue.path.length > 0 ? String(issue.path[0]) : "body",
    issue: issue.message
  }));

export function apiError(opts: {
  status: number;
  code: ApiErrorCode;
  message: string;
  hint: string;
  details?: FieldIssue[];
  headers?: Record<string, string>;
}): Response {
  const body: ErrorBody = {
    error: {
      code: opts.code,
      message: opts.message,
      hint: opts.hint,
      documentation_url: DOCS_URL,
      ...(opts.details ? { details: opts.details } : {})
    }
  };
  return new Response(JSON.stringify(body, null, 2), {
    status: opts.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...opts.headers
    }
  });
}
