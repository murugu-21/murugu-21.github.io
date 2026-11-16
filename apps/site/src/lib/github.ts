import { GITHUB_TOKEN } from "astro:env/server";

import { GithubClient } from "./github/client";
import { GhCliTransport, HttpsTransport } from "./github/transport";

export type { GithubRepo } from "./github/client";

export function githubFromEnv(): GithubClient {
  if (GITHUB_TOKEN) return new GithubClient(new HttpsTransport(GITHUB_TOKEN));
  return new GithubClient(new GhCliTransport());
}
