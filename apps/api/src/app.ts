import { Hono } from "hono";

import { appLayer, forRequest } from "#src/app.module.ts";
import type { AppEnv } from "#src/common/app-env.ts";
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

/**
 * The Worker's Hono app: every module's controller, mounted. Tests build one with fake providers
 * through `layer`, the way Nest's testing module overrides a provider.
 */
export function createApp(layer = appLayer()) {
  return (
    new Hono<AppEnv>()
      .use("*", async (c, next) => {
        c.set("services", forRequest({ layer, env: c.env }));
        await next();
      })
      .route("/agents/chat-room", chatController)
      // Keep wrangler.jsonc's run_worker_first list in sync with these routes.
      // /api/v1 must mount before /api, the permanent unversioned alias for v1.
      .route("/api/v1", apiController)
      .route("/api", apiController)
      .route("/openapi.json", openapiRootController)
      // Manifest routes register before /mcp so /mcp.json isn't taken as JSON-RPC.
      .route("/mcp.json", mcpManifestController)
      .route("/.well-known", wellKnownController)
      .route("/mcp", mcpController)
      .route("/blog/audio", audioController)
      .route("/", pagesController)
  );
}
