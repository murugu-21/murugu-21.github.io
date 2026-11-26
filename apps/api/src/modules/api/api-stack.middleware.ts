import { Hono, type MiddlewareHandler } from "hono";

import type { ApiEnv } from "#src/common/app-env.ts";
import { apiExceptionFilter } from "#src/common/filters/api-exception.filter.ts";
import { apiHeadersInterceptor } from "#src/common/interceptors/api-headers.interceptor.ts";
import { methodNotAllowedMiddleware } from "#src/common/middleware/method-not-allowed.middleware.ts";
import { readThrottleGuard } from "#src/modules/rate-limit/read-throttle.guard.ts";

export function createApiRouter({
  cors,
  enforceReads
}: {
  cors: MiddlewareHandler;
  enforceReads: boolean;
}): Hono<ApiEnv> {
  const router = new Hono<ApiEnv>();
  router.onError(apiExceptionFilter);
  router.use("*", cors);
  router.use("*", readThrottleGuard({ enforce: enforceReads }));
  router.use("*", apiHeadersInterceptor);
  router.use("*", methodNotAllowedMiddleware(router));
  return router;
}
