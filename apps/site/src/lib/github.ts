import type { GithubRepo } from "./github/client";

export type { GithubRepo };

type DescribedRepo = GithubRepo & { description: string };

export function resumeProjects(repos: GithubRepo[]): DescribedRepo[] {
  return repos.filter((repo): repo is DescribedRepo => (repo.description ?? "") !== "");
}
