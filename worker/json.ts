import { z } from "zod";

/** A JSON object: not null, not an array. */
export const JsonObject = z.record(z.string(), z.unknown());

/** Optional, and a value that fails `schema` is dropped instead of failing the parse. */
export const lenient = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

/** A JSON-encoded string whose decoded value must match `schema`. */
export const jsonString = <T extends z.ZodType>(schema: T) =>
  z
    .string()
    .transform((text, ctx) => {
      try {
        return JSON.parse(text);
      } catch {
        ctx.issues.push({ code: "custom", message: "must be valid JSON", input: text });
        return z.NEVER;
      }
    })
    .pipe(schema);
