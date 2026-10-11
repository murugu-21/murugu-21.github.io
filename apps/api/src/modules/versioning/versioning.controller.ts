import { Hono } from "hono";

import { READ_METHODS } from "@murugappan/contracts/api/routes.ts";
import type { AppEnv } from "#src/common/app-env.ts";
import { json } from "#src/common/http/json.ts";
import { publicOrigin } from "#src/common/http/public-origin.ts";
import { buildVersionsDocument } from "#src/modules/versioning/versions-document.ts";

export const versioningController = new Hono<AppEnv>().on(READ_METHODS, "/versions", c =>
  json(buildVersionsDocument(publicOrigin(c.req.url)))
);
