import { createMiddleware } from "hono/factory";

import type { AppEnv } from "#src/common/app-env.ts";
import { isOwnOrigin } from "#src/common/http/public-origin.ts";

/**
 * Any page can open a WebSocket, since CORS doesn't cover it, so only the site's own pages may
 * open a chat socket and spend the chat budget.
 */
export const siteOriginGuard = createMiddleware<AppEnv>(async (c, next) => {
  const isUpgrade = c.req.header("Upgrade") === "websocket";
  if (isUpgrade && !isOwnOrigin({ origin: c.req.header("Origin"), requestUrl: c.req.url })) {
    return c.text("Forbidden", 403);
  }
  await next();
});
