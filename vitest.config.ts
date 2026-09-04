import {cloudflareTest} from "@cloudflare/vitest-pool-workers";
import {defineConfig} from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {configPath: "./worker/test/wrangler.jsonc"}
    })
  ],
  test: {
    include: ["worker/test/**/*.test.ts", "src/**/*.test.ts"]
  }
});
