import type { Hono, MiddlewareHandler } from "hono";

import type { ApiEnv } from "#src/common/app-env.ts";
import { apiExceptionFilter } from "#src/common/filters/api-exception.filter.ts";
import { apiHeadersInterceptor } from "#src/common/interceptors/api-headers.interceptor.ts";
import { methodNotAllowedMiddleware } from "#src/common/middleware/method-not-allowed.middleware.ts";
import { readThrottleGuard } from "#src/modules/rate-limit/read-throttle.guard.ts";

// Call it before adding routes, and chain them onto the router it returns.
export function useApiStack<R extends Hono<ApiEnv>>(
  router: R,
  { cors, enforceReads }: { cors: MiddlewareHandler; enforceReads: boolean }
): R {
  router.onError(apiExceptionFilter);
  router.use("*", cors);
  router.use("*", readThrottleGuard({ enforce: enforceReads }));
  router.use("*", apiHeadersInterceptor);
  router.use("*", methodNotAllowedMiddleware(router));
  return router;
}
