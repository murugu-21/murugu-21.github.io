import { z } from "zod";

type Extra = Omit<z.GlobalMeta, "description">;

export const text = (description: string, extra: Extra = {}) =>
  z.string().meta({ description, ...extra });

export const nullableText = (description: string, extra: Extra = {}) =>
  z
    .string()
    .nullable()
    .meta({ description, ...extra });
