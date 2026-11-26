import { z } from "zod";

type StringBinding = { [K in keyof Env]: Env[K] extends string ? K : never }[keyof Env];

const Configured = z.string().trim().min(1);

export function configured(env: Env, name: StringBinding): string | null {
  return Configured.safeParse(env[name]).data ?? null;
}
