import type { Hono } from "hono";
import { methodNotAllowed } from "hono/method-not-allowed";

import { apiError } from "#src/common/http/api-error.ts";

// Hono finds the methods registered for the path (HEAD with GET); CORS answers OPTIONS everywhere.
// It needs the router it is installed on, to look up that router's routes.
export const methodNotAllowedMiddleware = <E extends { Bindings: Env }>(app: Hono<E>) =>
  methodNotAllowed({
    app,
    onMethodNotAllowed: (c, methods) => {
      const allow = [...methods, "OPTIONS"].join(", ");
      return apiError({
        status: 405,
        code: "method_not_allowed",
        message: `${c.req.method} is not supported on ${c.req.path}.`,
        hint: `Use ${allow} on this path instead.`,
        headers: { Allow: allow }
      });
    }
  });
