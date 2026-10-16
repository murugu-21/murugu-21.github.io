import { z } from "zod";

export const SharedWithTest = z.object({
  compatibility_date: z.string(),
  durable_objects: z.object({ bindings: z.array(z.record(z.string(), z.unknown())) }),
  exports: z.record(z.string(), z.unknown())
});

export const WranglerConfigs = z.object({
  production: SharedWithTest.extend({
    assets: z.object({ run_worker_first: z.array(z.string()) }),
    vars: z.object({ OPPORTUNITY_INBOX: z.email() }),
    send_email: z.array(z.object({ destination_address: z.string() }))
  }),
  test: SharedWithTest
});
export type WranglerConfigs = z.infer<typeof WranglerConfigs>;

export type WranglerConfigsRead =
  | { success: true; data: WranglerConfigs }
  | { success: false; issues: { file: string; path: string; message: string }[] };
