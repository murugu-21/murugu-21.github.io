// The JSON error envelope for every /api/* failure. The Worker owns /api/* (runWorkerFirst in
// cloudflare.config.ts) so agents never get the HTML 404 page.

import { z } from "zod";

import { text } from "./fields";

const ApiErrorCode = z
  .enum([
    "not_found",
    "method_not_allowed",
    "invalid_request",
    "unsupported_media_type",
    "payload_too_large",
    "rate_limited",
    "service_unavailable",
    "internal_error"
  ])
  .meta({ description: "Stable machine-readable failure code, safe to branch on." });

export const FieldIssue = z
  .object({
    field: text("The request field that was rejected."),
    issue: text("What the field must satisfy instead.")
  })
  .meta({ title: "FieldIssue", description: "One rejected request field and why." });
export type FieldIssue = z.infer<typeof FieldIssue>;

export const ErrorBody = z
  .object({
    error: z
      .object({
        code: ApiErrorCode,
        message: text("What went wrong, in one sentence."),
        hint: text("What to do about it, as a corrective action rather than a restatement."),
        documentation_url: text("Where the endpoint is documented.", { format: "uri" }),
        details: z.array(FieldIssue).optional().meta({
          description: "Present on field-level validation failures: one entry per offending field."
        })
      })
      .meta({ description: "The failure." })
  })
  .meta({
    title: "Error",
    description:
      "The single error shape every /api/* failure uses. Branch on `error.code`, not on the status text or the message."
  });

export const DOCS_URL = "https://murugappan.dev/developers/";

export function apiError(opts: {
  status: number;
  code: z.infer<typeof ApiErrorCode>;
  message: string;
  hint: string;
  details?: FieldIssue[];
  headers?: Record<string, string>;
}): Response {
  const body: z.infer<typeof ErrorBody> = {
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
