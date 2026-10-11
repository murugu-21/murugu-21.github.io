import { Hono } from "hono";

import type { ApiEnv } from "#src/common/app-env.ts";
import { apiError } from "#src/common/http/api-error.ts";
import { apiCorsMiddleware } from "#src/common/middleware/cors.middleware.ts";
import { useApiStack } from "#src/modules/api/api-stack.middleware.ts";
import { contactController } from "#src/modules/contact/contact.controller.ts";
import { openapiController } from "#src/modules/openapi/openapi.controller.ts";
import { postsController } from "#src/modules/posts/posts.controller.ts";
import { profileController } from "#src/modules/profile/profile.controller.ts";
import { versioningController } from "#src/modules/versioning/versioning.controller.ts";

/**
 * The public API, mounted at /api/v1 and /api. The shared stack is installed once here, so every
 * module controller under it gets the exception filter, CORS, the read throttle, the API headers
 * and JSON 405s.
 */
export const apiController = new Hono<ApiEnv>();

useApiStack(apiController, { cors: apiCorsMiddleware, enforceReads: true });

apiController.route("/", profileController);
apiController.route("/", postsController);
apiController.route("/", versioningController);
apiController.route("/", openapiController);
apiController.route("/", contactController);

// methodNotAllowedMiddleware turns this into a 405 when the path exists under another method.
apiController.all("*", c =>
  apiError({
    status: 404,
    code: "not_found",
    message: `There is no API endpoint at ${c.req.path}.`,
    hint: "Fetch https://murugappan.dev/openapi.json for the full list of endpoints."
  })
);
