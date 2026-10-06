// Described string fields for the API's zod schemas. The descriptions are the API's
// documentation: openapi.ts and the MCP tool schemas are generated from them.

import { z } from "zod";

type Extra = Record<string, unknown>;

export const text = (description: string, extra: Extra = {}) =>
  z.string().meta({ description, ...extra });

export const nullableText = (description: string, extra: Extra = {}) =>
  z
    .string()
    .nullable()
    .meta({ description, ...extra });
