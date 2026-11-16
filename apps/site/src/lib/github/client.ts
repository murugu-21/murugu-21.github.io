import { z } from "zod";

import PINNED_REPOS_QUERY from "./pinned-repos.graphql?raw";
import PROFILE_QUERY from "./profile.graphql?raw";
import { GithubAuthFailure, GithubFailure, type GithubTransport } from "./transport";

const GithubProfile = z.object({ bio: z.string().nullable() });
type GithubProfile = z.infer<typeof GithubProfile>;

const ProfileData = z.object({ user: GithubProfile.nullable() });

const PinnedRepoNode = z.object({
  name: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  homepageUrl: z.string().nullable(),
  forkCount: z.number(),
  diskUsage: z.number(),
  primaryLanguage: z.object({ name: z.string(), color: z.string().nullable() }).nullable(),
  stargazers: z.object({ totalCount: z.number() }),
  repositoryTopics: z
    .object({ nodes: z.array(z.object({ topic: z.object({ name: z.string() }) })).optional() })
    .optional()
});

const PinnedReposData = z.object({
  user: z
    .object({
      pinnedItems: z
        .object({ edges: z.array(z.object({ node: PinnedRepoNode })).optional() })
        .optional()
    })
    .nullable()
});

export type GithubRepo = Omit<z.infer<typeof PinnedRepoNode>, "repositoryTopics"> & {
  topics: string[];
};

type DescribedRepo = GithubRepo & { description: string };

function isRecoverable(e: unknown): e is GithubFailure {
  return e instanceof GithubFailure && !(e instanceof GithubAuthFailure);
}

function warnFallback(failure: GithubFailure, fallback: string): void {
  console.warn(`[github] ${failure.message}; ${fallback}`, ...failure.detail);
}

export class GithubClient {
  constructor(private readonly transport: GithubTransport) {}

  async profile(): Promise<GithubProfile | null> {
    try {
      const { user } = await this.ask(PROFILE_QUERY, ProfileData);
      return user;
    } catch (e) {
      if (!isRecoverable(e)) throw e;
      warnFallback(e, "rendering contact fallback");
      return null;
    }
  }

  async pinnedRepos(): Promise<GithubRepo[]> {
    try {
      const { user } = await this.ask(PINNED_REPOS_QUERY, PinnedReposData);
      return (user?.pinnedItems?.edges ?? []).map(({ node: { repositoryTopics, ...rest } }) => ({
        ...rest,
        topics: (repositoryTopics?.nodes ?? []).map(t => t.topic.name)
      }));
    } catch (e) {
      if (!isRecoverable(e)) throw e;
      warnFallback(e, "skipping pinned repos");
      return [];
    }
  }

  async resumeProjects(): Promise<DescribedRepo[]> {
    return (await this.pinnedRepos()).filter(
      (repo): repo is DescribedRepo => (repo.description ?? "") !== ""
    );
  }

  private async ask<T extends z.ZodType>(query: string, schema: T): Promise<z.infer<T>> {
    const reply = await this.transport.query(query);
    if (reply.errors) throw new GithubFailure("GraphQL errors", [reply.errors.map(e => e.message)]);
    const data = schema.safeParse(reply.data);
    if (!data.success) throw new GithubFailure("unexpected GraphQL data", [data.error.issues]);
    return data.data;
  }
}
