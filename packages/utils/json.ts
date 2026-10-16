import { z } from "zod";

export type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonRecord;
export type JsonRecord = { readonly [key: string]: JsonValue | undefined };

// Not `z.record(z.string(), z.json())`: that sends the type checker into infinite instantiation,
// and `z.json()` rejects a property set to `undefined`.
const JsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValue), JsonRecord])
);
export const JsonRecord: z.ZodType<JsonRecord> = z.record(z.string(), JsonValue.optional(), {
  error: "must be a JSON object"
});

export const lenient = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

export const jsonString = <T extends z.ZodType>(schema: T) =>
  z
    .string()
    .transform((text, ctx) => {
      try {
        const value: unknown = JSON.parse(text);
        return value;
      } catch {
        ctx.issues.push({ code: "custom", message: "must be valid JSON", input: text });
        return z.NEVER;
      }
    })
    .pipe(schema);
