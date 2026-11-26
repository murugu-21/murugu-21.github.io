import { GITHUB_SNAPSHOT, writeGithubSnapshot } from "#src/lib/github/snapshot.ts";
import { githubToken } from "#build-env";

await writeGithubSnapshot({ token: githubToken, path: GITHUB_SNAPSHOT });
