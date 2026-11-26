import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { z } from "zod";

import { GithubClient, GithubProfile, GithubRepo } from "./client";
import { GhCliTransport, HttpsTransport } from "./transport";

export const GITHUB_SNAPSHOT = fileURLToPath(
  new URL("../../../github-snapshot.json", import.meta.url)
);

const GithubSnapshot = z.object({
  profile: GithubProfile.nullable(),
  pinnedRepos: z.array(GithubRepo)
});
export type GithubSnapshot = z.infer<typeof GithubSnapshot>;

const MODULE_ID = "virtual:github-snapshot";
const RESOLVED_ID = `\0${MODULE_ID}`;

export async function writeGithubSnapshot({
  token,
  path
}: {
  token: string | undefined;
  path: string;
}): Promise<void> {
  const github = new GithubClient(token ? new HttpsTransport(token) : new GhCliTransport());
  const snapshot: GithubSnapshot = {
    profile: await github.profile(),
    pinnedRepos: await github.pinnedRepos()
  };
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`);
}

export async function readGithubSnapshot(path: string): Promise<GithubSnapshot> {
  return GithubSnapshot.parse(JSON.parse(await readFile(path, "utf8")));
}

export function snapshotModule({ profile, pinnedRepos }: GithubSnapshot): string {
  return [
    `export const profile = ${JSON.stringify(profile)};`,
    `export const pinnedRepos = ${JSON.stringify(pinnedRepos)};`
  ].join("\n");
}

export function githubSnapshot(): Plugin {
  return {
    name: "github-snapshot",
    resolveId: id => (id === MODULE_ID ? RESOLVED_ID : undefined),
    async load(id) {
      if (id !== RESOLVED_ID) return;
      this.addWatchFile(GITHUB_SNAPSHOT);
      return snapshotModule(await readGithubSnapshot(GITHUB_SNAPSHOT));
    }
  };
}
