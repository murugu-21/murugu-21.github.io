import {cloudflareTest} from "@cloudflare/vitest-plugin";
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
