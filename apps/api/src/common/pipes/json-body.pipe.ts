import { createMiddleware } from "hono/factory";
import type { z } from "zod";

import type { AppEnv } from "#src/common/app-env.ts";
import { apiError, fieldIssues } from "#src/common/http/api-error.ts";

/**
 * Parses a JSON body into `c.var.body`: 415 for another media type (any `…/json` passes),
 * 400 for malformed JSON, 422 for a body the schema rejects. Not hono's `validator`, which
 * lets a non-JSON media type through as `{}` and answers malformed JSON in plain text.
 */
export const jsonBodyPipe = <S extends z.ZodType>({
  schema,
  schemaName
}: {
  schema: S;
  schemaName: string;
}) =>
  createMiddleware<AppEnv & { Variables: { body: z.infer<S> } }>(async (c, next) => {
    const contentType = c.req.header("Content-Type") ?? "";
    if (!contentType.split(";")[0].trim().endsWith("/json")) {
      return apiError({
        status: 415,
        code: "unsupported_media_type",
        message: "This endpoint only accepts a JSON request body.",
        hint: "Send Content-Type: application/json with a JSON object body."
      });
    }

    let raw: unknown;
    try {
      raw = JSON.parse(await c.req.text());
    } catch {
      return apiError({
        status: 400,
        code: "invalid_request",
        message: "The request body could not be parsed as JSON.",
        hint: `Send a well-formed JSON object matching the ${schemaName} schema.`
      });
    }

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return apiError({
        status: 422,
        code: "invalid_request",
        message: "One or more fields in the request body are invalid.",
        hint: "Correct the fields listed in details and send the request again.",
        details: fieldIssues(parsed.error)
      });
    }
    c.set("body", parsed.data);
    await next();
  });
