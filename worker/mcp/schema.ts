// MCP output schemas must stand alone (the spec forbids resolving network
// `$ref`s), so the API's `components.schemas` refs are inlined.

export type JsonSchema = Record<string, unknown>;

const REF_PREFIX = "#/components/schemas/";
// Headroom over the API's nesting; a cycle trips it instead of hanging.
const MAX_DEPTH = 16;

export function inlineRefs(node: unknown, schemas: Record<string, unknown>, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    throw new Error(`inlineRefs: exceeded maximum schema depth (${MAX_DEPTH}) — is a $ref cyclic?`);
  }
  if (Array.isArray(node)) {
    return node.map(item => inlineRefs(item, schemas, depth + 1));
  }
  if (typeof node !== "object" || node === null) return node;

  const entries = Object.entries(node as JsonSchema);
  const ref = (node as JsonSchema).$ref;
  if (typeof ref === "string") {
    if (!ref.startsWith(REF_PREFIX)) {
      throw new Error(`inlineRefs: refusing to resolve external $ref '${ref}'`);
    }
    const name = ref.slice(REF_PREFIX.length);
    if (!(name in schemas)) {
      throw new Error(`inlineRefs: no schema named '${name}'`);
    }
    const resolved = inlineRefs(schemas[name], schemas, depth + 1) as JsonSchema;
    // JSON Schema 2020-12 allows keywords alongside $ref; the siblings win.
    const siblings: JsonSchema = {};
    for (const [key, value] of entries) {
      if (key === "$ref") continue;
      siblings[key] = inlineRefs(value, schemas, depth + 1);
    }
    return { ...resolved, ...siblings };
  }

  const out: JsonSchema = {};
  for (const [key, value] of entries) {
    out[key] = inlineRefs(value, schemas, depth + 1);
  }
  return out;
}

/** A named API schema as a self-contained JSON Schema 2020-12 document. */
export function resolveSchema(name: string, schemas: Record<string, unknown>): JsonSchema {
  return inlineRefs({ $ref: `${REF_PREFIX}${name}` }, schemas) as JsonSchema;
}
