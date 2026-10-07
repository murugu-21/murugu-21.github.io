// The one error envelope (contracts/api/errors.ts) every /api/* failure answers with.

import {
  DOCS_URL,
  type ApiErrorCode,
  type ErrorBody,
  type FieldIssue
} from "#contracts/api/errors.ts";

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
