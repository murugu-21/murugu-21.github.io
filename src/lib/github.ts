import { GITHUB_TOKEN, REQUIRE_GITHUB_PROFILE } from "astro:env/server";
import { z } from "zod";

const REQUIRED = REQUIRE_GITHUB_PROFILE === "1";

const GraphqlReply = z.object({
  data: z.unknown(),
  errors: z.array(z.object({ message: z.string() })).optional()
});

/** Build-time GraphQL query; logs and returns null on any failure so the build never breaks. */
async function queryGithub<T extends z.ZodType>({
  query,
  schema,
  fallback
}: {
  query: string;
  /** The shape of the reply's `data`. */
  schema: T;
  /** What the page does instead, for the log line. */
  fallback: string;
}): Promise<z.infer<T> | null> {
  if (!GITHUB_TOKEN) {
    console.warn(`[github] no GITHUB_TOKEN; ${fallback}`);
    return null;
  }
  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "User-Agent": "astro-build"
      },
      body: JSON.stringify({ query })
    });
    if (!res.ok) {
      console.warn(`[github] GraphQL HTTP ${res.status}; ${fallback}`);
      return null;
    }
    const reply = GraphqlReply.parse(await res.json());
    if (reply.errors) {
      console.warn(
        `[github] GraphQL errors; ${fallback}`,
        reply.errors.map(e => e.message)
      );
      return null;
    }
    const parsed = schema.safeParse(reply.data);
    if (!parsed.success) {
      console.warn(`[github] unexpected GraphQL data; ${fallback}`, parsed.error.issues);
      return null;
    }
    return parsed.data;
  } catch (e) {
    console.warn(`[github] fetch failed; ${fallback}`, e);
    return null;
  }
}

const GithubProfile = z.object({ bio: z.string().nullable() });
type GithubProfile = z.infer<typeof GithubProfile>;

export async function fetchGithubProfile(): Promise<GithubProfile | null> {
  const data = await queryGithub({
    query: `{ user(login: "murugu-21") { bio } }`,
    schema: z.object({ user: GithubProfile.nullable() }),
    fallback: "rendering contact fallback"
  });
  if (data?.user) return data.user;
  if (REQUIRED) throw new Error("[github] profile fetch failed but REQUIRE_GITHUB_PROFILE=1");
  return null;
}

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

export type GithubRepo = Omit<z.infer<typeof PinnedRepoNode>, "repositoryTopics"> & {
  topics: string[];
};

/** GitHub's diskUsage is in KB. */
export function formatRepoSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  return `${parseFloat((kb / 1024).toFixed(1))} MB`;
}

export async function fetchPinnedRepos(): Promise<GithubRepo[]> {
  const data = await queryGithub({
    query: `{ user(login: "murugu-21") { pinnedItems(first: 6, types: REPOSITORY) { edges { node { ... on Repository {
          name description url homepageUrl forkCount diskUsage
          primaryLanguage { name color }
          stargazers { totalCount }
          repositoryTopics(first: 12) { nodes { topic { name } } }
        } } } } } }`,
    schema: z.object({
      user: z
        .object({
          pinnedItems: z
            .object({ edges: z.array(z.object({ node: PinnedRepoNode })).optional() })
            .optional()
        })
        .nullable()
    }),
    fallback: "skipping pinned repos"
  });
  const edges = data?.user?.pinnedItems?.edges ?? [];
  return edges.map(({ node: { repositoryTopics, ...rest } }) => ({
    ...rest,
    topics: (repositoryTopics?.nodes ?? []).map(t => t.topic.name)
  }));
}
