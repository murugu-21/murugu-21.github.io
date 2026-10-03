// The JSON error envelope for every /api/* failure. The Worker owns /api/* (run_worker_first in
// wrangler.jsonc) so agents never get the HTML 404 page.

type ApiErrorCode =
  | "not_found"
  | "method_not_allowed"
  | "invalid_request"
  | "unsupported_media_type"
  | "payload_too_large"
  | "rate_limited"
  | "service_unavailable"
  | "internal_error";

export type FieldIssue = { field: string; issue: string };

export const DOCS_URL = "https://murugappan.dev/developers/";

export function apiError(opts: {
  status: number;
  code: ApiErrorCode;
  message: string;
  hint: string;
  details?: FieldIssue[];
  headers?: Record<string, string>;
}): Response {
  const body = {
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
