import { Hono } from "hono";

import { READ_METHODS } from "@murugappan/contracts/api/routes.ts";
import type { ApiEnv, AppEnv } from "#src/common/app-env.ts";
import { json } from "#src/common/http/json.ts";
import { publicOrigin } from "#src/common/http/public-origin.ts";
import { specCorsMiddleware } from "#src/common/middleware/cors.middleware.ts";
import { useApiStack } from "#src/modules/api/api-stack.middleware.ts";
import { buildOpenApiDocument } from "#src/modules/openapi/openapi-document.ts";

const specResponse = (requestUrl: string) => json(buildOpenApiDocument(publicOrigin(requestUrl)));

/** /api/openapi.json, inside the API router. */
export const openapiController = new Hono<AppEnv>().on(READ_METHODS, "/openapi.json", c =>
  specResponse(c.req.url)
);

/** /openapi.json lives outside /api, so it gets its own router and stack. */
// A throttled client must still reach the spec, so reads are counted but not enforced.
export const openapiRootController = useApiStack(new Hono<ApiEnv>(), {
  cors: specCorsMiddleware,
  enforceReads: false
}).on(READ_METHODS, "/", c => specResponse(c.req.url));
