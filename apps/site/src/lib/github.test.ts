import { afterEach, expect, it, vi } from "vite-plus/test";

import { resetEnv, setEnv } from "#src/test/astro-env-server.ts";
import { fakeGh } from "#src/test/fake-gh.ts";
import { githubFromEnv } from "./github";

const answer = (bio: string) => JSON.stringify({ data: { user: { bio } } });

afterEach(() => {
  resetEnv();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("asks over HTTPS when GITHUB_TOKEN is set, and through gh's login when it isn't", async () => {
  await fakeGh({ stdout: answer("from gh") });
  vi.stubGlobal("fetch", async () => new Response(answer("over HTTPS")));

  setEnv({ GITHUB_TOKEN: "tok" });
  expect(await githubFromEnv().profile()).toEqual({ bio: "over HTTPS" });

  setEnv({ GITHUB_TOKEN: undefined });
  expect(await githubFromEnv().profile()).toEqual({ bio: "from gh" });
});
