import { describe, expect, it } from "vite-plus/test";

import { createApp } from "#src/app.ts";
import worker from "#src/server.ts";
import { SharedWithTest, type WranglerConfigsRead } from "#test/wrangler-config.ts";

declare const __WRANGLER_CONFIGS__: WranglerConfigsRead;

if (!__WRANGLER_CONFIGS__.success) {
  const issues = __WRANGLER_CONFIGS__.issues.map(i => `  ${i.file} ${i.path}: ${i.message}`);
  throw new Error(`wrangler.test.ts can't read these fields:\n${issues.join("\n")}`);
}
const { production, test } = __WRANGLER_CONFIGS__.data;

// Hono's `/x/*` also matches `/x`, and below a mount only pages (which end in "/") reach the Worker.
function representatives(pattern: string): string[] {
  const literal = pattern.replaceAll(/:[^/]+/g, "x");
  if (!literal.endsWith("/*")) return [literal];
  const mount = literal.slice(0, -2);
  return [mount || "/", `${mount}/x/`];
}

// With not_found_handling "none" a miss already reaches the Worker, and no asset exists here.
const UNSHADOWED_MOUNTS = new Set(["/api", "/.well-known"]);

/* oxlint-disable tests/observe-behaviour -- relation tests: each compares two tables (config rows, or routes against config), so neither side is a literal */
describe("apps/api/cloudflare.config.ts", () => {
  it("runs the Worker first for every route app.ts mounts", () => {
    const patterns = production.assets.run_worker_first.map(
      glob => new URLPattern({ pathname: glob })
    );
    const runsWorkerFirst = (pathname: string) =>
      UNSHADOWED_MOUNTS.has(pathname) || patterns.some(p => p.test({ pathname }));
    const routes = [...new Set(createApp().routes.map(r => r.path))];
    const uncovered = routes.filter(route => !representatives(route).every(runsWorkerFirst));
    expect(
      uncovered,
      `No assets.runWorkerFirst pattern in apps/api/cloudflare.config.ts covers every path of these routes from apps/api/src/app.ts: ${uncovered.join(", ")}. Add one for each.`
    ).toEqual([]);
  });

  it("has a scheduled handler exactly when it declares a cron trigger", () => {
    expect(
      production.triggers.crons.length > 0,
      "A scheduled trigger in apps/api/cloudflare.config.ts runs the `scheduled` export of apps/api/src/server.ts. Add or remove both together."
    ).toBe("scheduled" in worker);
  });

  it("shares production's compatibility date and Durable Objects", () => {
    expect(
      test,
      "apps/api/test/cloudflare.config.ts must declare the same compatibility date, Durable Object bindings and exports as apps/api/cloudflare.config.ts. Copy them over."
    ).toEqual(SharedWithTest.parse(production));
  });
});
/* oxlint-enable tests/observe-behaviour */
