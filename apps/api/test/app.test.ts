import { Hono } from "hono";
import { expect, it } from "vite-plus/test";

import { createApp } from "#src/app.ts";
import { apiController } from "#src/modules/api/api.controller.ts";

const routesUnderApi = (app: Pick<Hono, "routes">) =>
  app.routes
    .filter(r => r.path === "/api" || r.path.startsWith("/api/"))
    .map(r => `${r.method} ${r.path}`);

it("serves every route under /api through apiController's stack", () => {
  const apiAlone = new Hono().route("/api/v1", apiController).route("/api", apiController);
  // oxlint-disable-next-line tests/observe-behaviour -- a relation between app.ts's route table and apiController's
  expect(
    routesUnderApi(createApp()),
    "apps/api/src/app.ts mounts something under /api besides apiController at /api/v1 and /api. Mount API controllers in apps/api/src/modules/api/api.controller.ts instead, which gives them the API's stack."
  ).toEqual(routesUnderApi(apiAlone));
});
