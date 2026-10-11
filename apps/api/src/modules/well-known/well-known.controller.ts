// /.well-known/api-catalog (RFC 9727) and the MCP server.json, also at /mcp.json.

import { Hono } from "hono";

import { READ_METHODS } from "@murugappan/contracts/api/routes.ts";
import type { AppEnv } from "#src/common/app-env.ts";
import { publicOrigin } from "#src/common/http/public-origin.ts";
import { readOnlyCorsMiddleware } from "#src/common/middleware/cors.middleware.ts";
import { buildApiCatalog, buildMcpManifest } from "#src/modules/well-known/well-known-documents.ts";

/** RFC 9727 media type for a link set serialised as JSON (RFC 9264). */
const LINKSET_MEDIA_TYPE = "application/linkset+json";

const CACHE = "public, max-age=3600";

function document(body: unknown, contentType: string): Response {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": `${contentType}; charset=utf-8`,
      "Cache-Control": CACHE
    }
  });
}

export const wellKnownController = new Hono<AppEnv>();

wellKnownController.use("*", readOnlyCorsMiddleware);

wellKnownController.on(READ_METHODS, "/api-catalog", c =>
  document(buildApiCatalog(publicOrigin(c.req.url)), LINKSET_MEDIA_TYPE)
);

const manifestResponse = (requestUrl: string) =>
  document(buildMcpManifest(publicOrigin(requestUrl)), "application/json");

wellKnownController.on(READ_METHODS, "/mcp.json", c => manifestResponse(c.req.url));

/** The same manifest at the site root, where clients look first. */
export const mcpManifestController = new Hono<AppEnv>();

mcpManifestController.use("*", readOnlyCorsMiddleware);

mcpManifestController.on(READ_METHODS, "/", c => manifestResponse(c.req.url));
