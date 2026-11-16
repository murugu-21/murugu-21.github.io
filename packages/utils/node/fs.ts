import { access } from "node:fs/promises";

import { z } from "zod";

const Missing = z.object({ code: z.enum(["ENOENT", "ENOTDIR"]) });

export const exists = (path: string | URL) =>
  access(path).then(
    () => true,
    () => false
  );

export async function ifPresent<T>(read: Promise<T>): Promise<T | undefined> {
  try {
    return await read;
  } catch (err) {
    if (Missing.safeParse(err).success) return undefined;
    throw err;
  }
}
