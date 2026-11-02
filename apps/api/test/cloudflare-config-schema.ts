import { z } from "zod";

const DurableObjectsIgnoringWorker = z
  .record(z.string(), z.object({ type: z.string(), exportName: z.string().optional() }))
  .transform(env =>
    Object.fromEntries(
      Object.entries(env).filter(([, binding]) => binding.type === "durable-object")
    )
  );

export const SharedWithTest = z.object({
  compatibilityDate: z.string(),
  env: DurableObjectsIgnoringWorker,
  exports: z.record(z.string(), z.unknown())
});

export const CloudflareConfigs = z.object({
  production: SharedWithTest.extend({
    assets: z.object({ runWorkerFirst: z.array(z.string()) }),
    triggers: z.array(z.object({ type: z.string() })).default([])
  }),
  test: SharedWithTest
});
export type CloudflareConfigs = z.infer<typeof CloudflareConfigs>;

export type ConfigIssue = { file: string; path: string; message: string };

export type CloudflareConfigsRead =
  | { success: true; data: CloudflareConfigs }
  | { success: false; issues: ConfigIssue[] };
