import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";

import { apiError } from "#src/common/http/api-error.ts";
import { versionHeaders, versionLinkHeader } from "#src/common/http/version-headers.ts";

/**
 * The API's last resort, like Nest's global exception filter: anything a controller's `Render`
 * table didn't handle answers the documented JSON 500 instead of Hono's plain-text one.
 */
export const apiExceptionFilter: ErrorHandler = (error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  console.error("api request failed", c.req.method, c.req.path, error);
  return apiError({
    status: 500,
    code: "internal_error",
    message: "The server failed while answering this request.",
    hint: "Retry in a few minutes. If it keeps failing, use the email link in GET /api/profile.",
    // The interceptor misses an error thrown before it runs, such as in the guard.
    headers: { ...versionHeaders(), Link: versionLinkHeader() }
  });
};
