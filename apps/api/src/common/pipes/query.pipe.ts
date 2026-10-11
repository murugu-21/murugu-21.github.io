import { createMiddleware } from "hono/factory";
import type { z } from "zod";

import type { AppEnv } from "#src/common/app-env.ts";
import { apiError, fieldIssues } from "#src/common/http/api-error.ts";

/** Validates the query string (first value per key) into `c.var.query`, or answers 400. */
export const queryPipe = <S extends z.ZodType>({ schema, hint }: { schema: S; hint: string }) =>
  createMiddleware<AppEnv & { Variables: { query: z.infer<S> } }>(async (c, next) => {
    const parsed = schema.safeParse(c.req.query());
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: "invalid_request",
        message: "One or more query parameters are invalid.",
        hint,
        details: fieldIssues(parsed.error)
      });
    }
    c.set("query", parsed.data);
    await next();
  });
