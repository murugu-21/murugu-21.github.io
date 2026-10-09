// Described string fields for the API's zod schemas. The descriptions are the API's
// documentation: openapi.ts and the MCP tool schemas are generated from them.

import { z } from "zod";

type Extra = Omit<z.GlobalMeta, "description">;

// oxlint-disable-next-line contracts/shapes-only -- builds a schema, so it is a shape
export const text = (description: string, extra: Extra = {}) =>
  z.string().meta({ description, ...extra });

// oxlint-disable-next-line contracts/shapes-only -- builds a schema, so it is a shape
export const nullableText = (description: string, extra: Extra = {}) =>
  z
    .string()
    .nullable()
    .meta({ description, ...extra });
