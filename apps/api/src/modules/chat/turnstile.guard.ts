import { defineMiddleware } from "hono/factory";

import type { AppEnv } from "#src/common/app-env.ts";
import { passesTurnstile } from "#src/modules/chat/turnstile.client.ts";

export const turnstileGuard = defineMiddleware<AppEnv>(async (c, next) => {
  const isUpgrade = c.req.header("Upgrade") === "websocket";
  if (isUpgrade && !(await passesTurnstile(c))) return c.text("Forbidden", 403);
  await next();
});
