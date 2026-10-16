import { Hono } from "hono";

import type { ApiEnv, AppEnv } from "#src/common/app-env.ts";
import { json } from "#src/common/http/json.ts";
import { publicOrigin } from "#src/common/http/public-origin.ts";
import { specCorsMiddleware } from "#src/common/middleware/cors.middleware.ts";
import { useApiStack } from "#src/modules/api/api-stack.middleware.ts";
import { buildOpenApiDocument } from "#src/modules/openapi/openapi-document.ts";

const specResponse = (requestUrl: string) => json(buildOpenApiDocument(publicOrigin(requestUrl)));

export const openapiController = new Hono<AppEnv>().get("/openapi.json", c =>
  specResponse(c.req.url)
);

export const openapiRootController = useApiStack(new Hono<ApiEnv>(), {
  cors: specCorsMiddleware,
  enforceReads: false
}).get("/", c => specResponse(c.req.url));
