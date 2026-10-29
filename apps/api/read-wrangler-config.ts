import { convertToWranglerConfig, loadAndParseConfig } from "@cloudflare/config";
import { unstable_readConfig } from "wrangler";

import { WranglerConfigs, type WranglerConfigsRead } from "#test/wrangler-config.ts";

// The workers pool runs in workerd, which can't load either config, so the root vite.config.ts
// reads them here in node and hands the result to wrangler.test.ts.
export async function readWranglerConfigs(
  paths: Record<keyof WranglerConfigs, string>
): Promise<WranglerConfigsRead> {
  const { result: parsed } = await loadAndParseConfig(paths.production, {
    isPreview: false,
    mode: "production"
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map(({ path, message }) => ({
      file: paths.production,
      path: path.map(String).join("."),
      message
    }));
    return { success: false, issues };
  }

  const production: unknown = convertToWranglerConfig(parsed.data);
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
