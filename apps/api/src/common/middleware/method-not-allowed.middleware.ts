import type { Hono } from "hono";
import { methodNotAllowed } from "hono/method-not-allowed";

import { requestedPath } from "#src/common/http/api-alias.ts";
import { apiError } from "#src/common/http/api-error.ts";

// Hono finds the methods registered for the path (HEAD with GET); CORS answers OPTIONS everywhere.
export const methodNotAllowedMiddleware = <E extends { Bindings: Env }>(app: Hono<E>) =>
  methodNotAllowed({
    app,
    onMethodNotAllowed: (c, methods) => {
      const allow = [...methods, "OPTIONS"].join(", ");
      return apiError({
        status: 405,
        code: "method_not_allowed",
        message: `${c.req.method} is not supported on ${requestedPath(c.req.raw)}.`,
        hint: `Use ${allow} on this path instead.`,
        headers: { Allow: allow }
      });
    }
  });
