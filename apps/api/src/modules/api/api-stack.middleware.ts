import type { Hono, MiddlewareHandler } from "hono";

import type { ApiEnv } from "#src/common/app-env.ts";
import { apiExceptionFilter } from "#src/common/filters/api-exception.filter.ts";
import { apiHeadersInterceptor } from "#src/common/interceptors/api-headers.interceptor.ts";
import { methodNotAllowedMiddleware } from "#src/common/middleware/method-not-allowed.middleware.ts";
import { readThrottleGuard } from "#src/modules/rate-limit/read-throttle.guard.ts";

/**
 * Installs what every API router runs, in Nest's order: the exception filter, CORS, the read
 * throttle guard, the API headers interceptor, then JSON 405s. Call it before adding routes.
 */
export function useApiStack(
  router: Hono<ApiEnv>,
  { cors, enforceReads }: { cors: MiddlewareHandler; enforceReads: boolean }
): void {
  router.onError(apiExceptionFilter);
  router.use("*", cors);
  router.use("*", readThrottleGuard({ enforce: enforceReads }));
  router.use("*", apiHeadersInterceptor);
  router.use("*", methodNotAllowedMiddleware(router));
}
