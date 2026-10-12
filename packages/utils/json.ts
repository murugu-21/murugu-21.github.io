import { z } from "zod";

/** A value `JSON.stringify` writes as given. It leaves out a property set to `undefined`. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonRecord;
/** A JSON object: not null, not an array. */
export type JsonRecord = { readonly [key: string]: JsonValue | undefined };

// Not `z.record(z.string(), z.json())`: that sends the type checker into infinite instantiation,
// and `z.json()` rejects a property set to `undefined`.
const JsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValue), JsonRecord])
);
export const JsonRecord: z.ZodType<JsonRecord> = z.record(z.string(), JsonValue.optional(), {
  error: "must be a JSON object"
});

/** Optional, and a value that fails `schema` is dropped instead of failing the parse. */
export const lenient = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

/** A JSON-encoded string whose decoded value must match `schema`. */
export const jsonString = <T extends z.ZodType>(schema: T) =>
  z
    .string()
    .transform((text, ctx) => {
      try {
        // Left for `schema` to parse: `JSON.parse` types its result as `any`.
        const value: unknown = JSON.parse(text);
        return value;
      } catch {
        ctx.issues.push({ code: "custom", message: "must be valid JSON", input: text });
        return z.NEVER;
      }
    })
    .pipe(schema);
