import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";

import { apiError } from "#src/common/http/api-error.ts";
import { versionHeaders, versionLinkHeader } from "#src/common/http/version-headers.ts";

export const apiExceptionFilter: ErrorHandler = c => {
  if (c.error instanceof HTTPException) return c.error.getResponse();
  console.error("api request failed", c.req.method, c.req.path, c.error);
  return apiError({
    status: 500,
    code: "internal_error",
    message: "The server failed while answering this request.",
    hint: "Retry in a few minutes. If it keeps failing, use the email link in GET /api/profile.",
    headers: { ...versionHeaders(), Link: versionLinkHeader() }
  });
};
