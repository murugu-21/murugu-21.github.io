import { unstable_readConfig } from "wrangler";

import { WranglerConfigs, type WranglerConfigsRead } from "#test/wrangler-config.ts";

// The workers pool runs in workerd, which can't read wrangler.jsonc, so the root vite.config.ts
// reads it here in node and hands the result to wrangler.test.ts.
export function readWranglerConfigs(
  paths: Record<keyof WranglerConfigs, string>
): WranglerConfigsRead {
  const production: unknown = unstable_readConfig({ config: paths.production });
  const test: unknown = unstable_readConfig({ config: paths.test });
  const result = WranglerConfigs.safeParse({ production, test });
  if (result.success) return result;
  return {
    success: false,
    issues: result.error.issues.map(({ path: [key, ...path], message }) => ({
      file: key === "production" || key === "test" ? paths[key] : String(key),
      path: path.join("."),
      message
    }))
  };
}
