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

it.each([
  {
    name: "GitHub rejects GITHUB_TOKEN",
    token: "expired",
    error: "GitHub rejected GITHUB_TOKEN (HTTP 401)"
  },
  { name: "gh is not logged in", token: undefined, error: "gh is not logged in; run gh auth login" }
])("fails the build when $name", async ({ token, error }) => {
  await fakeGh({ status: 4, stderr: "To get started with GitHub CLI, please run:  gh auth login" });
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));
  setEnv({ GITHUB_TOKEN: token });

  await expect(githubFromEnv().profile()).rejects.toThrow(error);
});
