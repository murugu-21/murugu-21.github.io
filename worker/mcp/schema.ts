// MCP output schemas must stand alone (the spec forbids resolving network
// `$ref`s), so the API's `components.schemas` refs are inlined.

import { JsonObject } from "../../utils/json";

export type JsonSchema = Record<string, unknown>;

const REF_PREFIX = "#/components/schemas/";
// Headroom over the API's nesting; a cycle trips it instead of hanging.
const MAX_DEPTH = 16;

export function inlineRefs(node: unknown, schemas: Record<string, JsonSchema>, depth = 0): unknown {
  if (Array.isArray(node)) {
    return node.map(item => inlineRefs(item, schemas, depth + 1));
  }
  const parsed = JsonObject.safeParse(node);
  return parsed.success ? inlineObject(parsed.data, schemas, depth) : node;
}

function inlineObject(
  node: JsonSchema,
  schemas: Record<string, JsonSchema>,
  depth: number
): JsonSchema {
  if (depth > MAX_DEPTH) {
    throw new Error(
      `inlineRefs: exceeded maximum schema depth (${MAX_DEPTH}), which usually means a cyclic $ref`
    );
  }
  const { $ref: ref, ...siblings } = node;
  const isRef = typeof ref === "string";
  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(isRef ? siblings : node)) {
    out[key] = inlineRefs(value, schemas, depth + 1);
  }
  if (!isRef) return out;

  if (!ref.startsWith(REF_PREFIX)) {
    throw new Error(`inlineRefs: refusing to resolve external $ref '${ref}'`);
  }
  const name = ref.slice(REF_PREFIX.length);
  if (!(name in schemas)) {
    throw new Error(`inlineRefs: no schema named '${name}'`);
  }
  // JSON Schema 2020-12 allows keywords alongside $ref; the siblings win.
  return { ...inlineObject(schemas[name], schemas, depth + 1), ...out };
}

/** A named API schema as a self-contained JSON Schema 2020-12 document. */
export function resolveSchema(name: string, schemas: Record<string, JsonSchema>): JsonSchema {
  return inlineObject({ $ref: `${REF_PREFIX}${name}` }, schemas, 0);
}
