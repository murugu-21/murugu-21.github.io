import { z } from "zod";

const BindingIgnoringWorker = z.object({ name: z.string(), class_name: z.string() });

export const SharedWithTest = z.object({
  compatibility_date: z.string(),
  durable_objects: z.object({ bindings: z.array(BindingIgnoringWorker) }),
  exports: z.record(z.string(), z.unknown())
});

export const WranglerConfigs = z.object({
  production: SharedWithTest.extend({
    assets: z.object({ run_worker_first: z.array(z.string()) }),
    triggers: z.object({ crons: z.array(z.string()) })
  }),
  test: SharedWithTest
});
export type WranglerConfigs = z.infer<typeof WranglerConfigs>;

export type ConfigIssue = { file: string; path: string; message: string };

export type WranglerConfigsRead =
  | { success: true; data: WranglerConfigs }
  | { success: false; issues: ConfigIssue[] };
