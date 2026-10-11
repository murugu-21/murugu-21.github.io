import { bodyLimit } from "hono/body-limit";

import { apiError } from "#src/common/http/api-error.ts";

/** 413 in the API's error shape. Runs before the JSON body pipe, so size wins over media type. */
export const bodyLimitMiddleware = ({
  maxBytes,
  schemaName
}: {
  maxBytes: number;
  schemaName: string;
}) =>
  bodyLimit({
    maxSize: maxBytes,
    onError: () =>
      apiError({
        status: 413,
        code: "payload_too_large",
        message: "The request body is larger than this endpoint accepts.",
        hint: `Keep the whole JSON body under ${maxBytes} bytes. See the ${schemaName} schema for the per-field limits.`
      })
  });
