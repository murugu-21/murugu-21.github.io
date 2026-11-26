import type { GithubSnapshot } from "#src/lib/github/snapshot.ts";

export let profile: GithubSnapshot["profile"] = null;
export let pinnedRepos: GithubSnapshot["pinnedRepos"] = [];

export function setGithubSnapshot(snapshot: GithubSnapshot): void {
  ({ profile, pinnedRepos } = snapshot);
}

export function resetGithubSnapshot(): void {
  setGithubSnapshot({ profile: null, pinnedRepos: [] });
}
