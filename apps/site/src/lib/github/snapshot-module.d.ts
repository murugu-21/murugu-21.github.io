declare module "virtual:github-snapshot" {
  export const profile: import("./snapshot.ts").GithubSnapshot["profile"];
  export const pinnedRepos: import("./snapshot.ts").GithubSnapshot["pinnedRepos"];
}
