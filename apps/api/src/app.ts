import { Hono } from "hono";

import { appLayer, forRequest } from "#src/app.module.ts";
import type { AppEnv } from "#src/common/app-env.ts";
import { routedPath } from "#src/common/http/api-alias.ts";
import { apiController } from "#src/modules/api/api.controller.ts";
import { audioController } from "#src/modules/audio/audio.controller.ts";
import { chatController } from "#src/modules/chat/chat.controller.ts";
import { mcpController } from "#src/modules/mcp/mcp.controller.ts";
import { openapiRootController } from "#src/modules/openapi/openapi.controller.ts";
import { pagesController } from "#src/modules/pages/pages.controller.ts";
import {
  mcpManifestController,
  wellKnownController
} from "#src/modules/well-known/well-known.controller.ts";

export function createApp(layer = appLayer()) {
  return new Hono<AppEnv>({ getPath: routedPath })
    .use("*", async (c, next) => {
      c.set("services", forRequest({ layer, env: c.env }));
      await next();
    })
    .route("/agents/chat-room", chatController)
    .route("/api/v1", apiController)
    .route("/openapi.json", openapiRootController)
    .route("/mcp.json", mcpManifestController)
    .route("/.well-known", wellKnownController)
    .route("/mcp", mcpController)
    .route("/blog/audio", audioController)
    .route("/", pagesController);
}
