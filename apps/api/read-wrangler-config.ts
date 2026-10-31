import { convertToWranglerConfig, loadAndParseConfig } from "@cloudflare/config";

import {
  type ConfigIssue,
  WranglerConfigs,
  type WranglerConfigsRead
} from "#test/wrangler-config.ts";

async function readConfig(file: string): Promise<{ config: unknown } | { issues: ConfigIssue[] }> {
  const { result } = await loadAndParseConfig(file, { isPreview: false, mode: "production" });
  if (result.success) return { config: convertToWranglerConfig(result.data) };
  return {
    issues: result.error.issues.map(({ path, message }) => ({
      file,
      path: path.map(String).join("."),
      message
    }))
  };
}

// The workers pool runs in workerd, which can't load either config, so the root vite.config.ts
// reads them here in node and hands the result to wrangler.test.ts.
export async function readWranglerConfigs(
  paths: Record<keyof WranglerConfigs, string>
): Promise<WranglerConfigsRead> {
  const [production, test] = await Promise.all([
    readConfig(paths.production),
    readConfig(paths.test)
  ]);
  if ("issues" in production || "issues" in test) {
    const issues = [production, test].flatMap(read => ("issues" in read ? read.issues : []));
    return { success: false, issues };
  }

  const result = WranglerConfigs.safeParse({ production: production.config, test: test.config });
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
