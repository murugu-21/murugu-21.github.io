// The OpenAPI document in packages/contracts/api/openapi.ts, served at /openapi.json and
// /api/openapi.json with `servers` naming the host that answered.

import { OPENAPI_DOCUMENT, type OpenApiDocument } from "@murugappan/contracts/api/openapi.ts";

export function buildOpenApiDocument(origin: string): OpenApiDocument {
  const { openapi, info, ...rest } = OPENAPI_DOCUMENT;
  return { openapi, info, servers: [{ url: origin, description: "Production" }], ...rest };
}
