import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { fakeGh } from "#src/test/fake-gh.ts";
import { readGithubSnapshot, snapshotModule, writeGithubSnapshot } from "./snapshot";

const answer = (bio: string) =>
  JSON.stringify({
    data: {
      user: {
        bio,
        pinnedItems: {
          edges: [
            {
              node: {
                name: "portfolio",
                description: "This site.",
                url: "https://github.com/murugu-21/portfolio",
                homepageUrl: null,
                forkCount: 0,
                diskUsage: 1,
                primaryLanguage: null,
                stargazers: { totalCount: 3 },
                repositoryTopics: { nodes: [{ topic: { name: "astro" } }] }
              }
            }
          ]
        }
      }
    }
  });

const snapshotWith = (bio: string) => ({
  profile: { bio },
  pinnedRepos: [
    {
      name: "portfolio",
      description: "This site.",
      url: "https://github.com/murugu-21/portfolio",
      homepageUrl: null,
      forkCount: 0,
      diskUsage: 1,
      primaryLanguage: null,
      stargazers: { totalCount: 3 },
      topics: ["astro"]
    }
  ]
});

let dir = "";
let path = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "github-snapshot-"));
  path = join(dir, "github-snapshot.json");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true });
});

it("snapshots GitHub over HTTPS when GITHUB_TOKEN is set, and through gh's login when it isn't", async () => {
  await fakeGh({ stdout: answer("from gh") });
  vi.stubGlobal("fetch", async () => new Response(answer("over HTTPS")));

  await writeGithubSnapshot({ token: "tok", path });
  expect(await readGithubSnapshot(path)).toEqual(snapshotWith("over HTTPS"));

  await writeGithubSnapshot({ token: undefined, path });
  expect(await readGithubSnapshot(path)).toEqual(snapshotWith("from gh"));
});

it.each([
  {
    name: "GitHub rejects GITHUB_TOKEN",
    token: "expired",
    error: "GitHub rejected GITHUB_TOKEN (HTTP 401)"
  },
  { name: "gh is not logged in", token: undefined, error: "gh is not logged in; run gh auth login" }
])("fails when $name", async ({ token, error }) => {
  await fakeGh({ status: 4, stderr: "To get started with GitHub CLI, please run:  gh auth login" });
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));

  await expect(writeGithubSnapshot({ token, path })).rejects.toThrow(error);
});

it("serves the snapshot file's profile and repos as module exports", async () => {
  await writeFile(path, JSON.stringify(snapshotWith("served")));

  const code = snapshotModule(await readGithubSnapshot(path));
  const served: unknown = await import(`data:text/javascript,${encodeURIComponent(code)}`);

  expect(served).toMatchObject(snapshotWith("served"));
});

it("rejects a snapshot of the wrong shape", async () => {
  await writeFile(path, JSON.stringify({ profile: { bio: 5 }, pinnedRepos: [] }));

  await expect(readGithubSnapshot(path)).rejects.toThrow(/"bio"/);
});
