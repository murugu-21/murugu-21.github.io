import { expect, it } from "vite-plus/test";

import { requireDeployEnv } from "./build-env";

it("fails a Workers Builds build without a Turnstile site key, and passes a local one", () => {
  expect(() => requireDeployEnv({ WORKERS_CI: "1", PUBLIC_TURNSTILE_SITE_KEY: " " })).toThrow(
    "PUBLIC_TURNSTILE_SITE_KEY is unset in Workers Builds, so the deployed chat would refuse every visitor"
  );
  expect(
    requireDeployEnv({ WORKERS_CI: "1", PUBLIC_TURNSTILE_SITE_KEY: "0x4AAA" })
  ).toBeUndefined();
  expect(requireDeployEnv({})).toBeUndefined();
});
