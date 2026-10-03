const REQUIRED = process.env.REQUIRE_GITHUB_PROFILE === "1";

interface GithubProfile {
  bio: string | null;
}

/** Build-time GraphQL query; logs and returns null on any failure so the build never breaks. */
async function queryGithub<T>({
  query,
  fallback
}: {
  query: string;
  /** What the page does instead, for the log line. */
  fallback: string;
}): Promise<T | null> {
  // Vite exposes .env via import.meta.env; process.env covers plain-node contexts.
  const token = import.meta.env.GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn(`[github] no GITHUB_TOKEN — ${fallback}`);
    return null;
  }
  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "astro-build"
      },
      body: JSON.stringify({ query })
    });
    if (!res.ok) {
      console.warn(`[github] GraphQL HTTP ${res.status} — ${fallback}`);
      return null;
    }
    const json = await res.json();
    if (json.errors) {
      console.warn(
        `[github] GraphQL errors — ${fallback}`,
        json.errors.map((e: { message: string }) => e.message)
      );
      return null;
    }
    return json.data ?? null;
  } catch (e) {
    console.warn(`[github] fetch failed — ${fallback}`, e);
    return null;
  }
}

export async function fetchGithubProfile(): Promise<GithubProfile | null> {
  const data = await queryGithub<{ user: GithubProfile | null }>({
    query: `{ user(login: "murugu-21") { bio } }`,
    fallback: "rendering contact fallback"
  });
  if (data?.user) return data.user;
  if (REQUIRED) throw new Error("[github] profile fetch failed but REQUIRE_GITHUB_PROFILE=1");
  return null;
}

export interface GithubRepo {
  name: string;
  description: string | null;
  url: string;
  homepageUrl: string | null;
  forkCount: number;
  diskUsage: number;
  primaryLanguage: { name: string; color: string } | null;
  stargazers: { totalCount: number };
  topics: string[];
}

/** GitHub's diskUsage is in KB. */
export function formatRepoSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  return `${parseFloat((kb / 1024).toFixed(1))} MB`;
}

type PinnedRepoNode = Omit<GithubRepo, "topics"> & {
  repositoryTopics?: { nodes?: { topic: { name: string } }[] };
};

export async function fetchPinnedRepos(): Promise<GithubRepo[]> {
  const data = await queryGithub<{
    user: { pinnedItems?: { edges?: { node: PinnedRepoNode }[] } } | null;
  }>({
    query: `{ user(login: "murugu-21") { pinnedItems(first: 6, types: REPOSITORY) { edges { node { ... on Repository {
          name description url homepageUrl forkCount diskUsage
          primaryLanguage { name color }
          stargazers { totalCount }
          repositoryTopics(first: 12) { nodes { topic { name } } }
        } } } } } }`,
    fallback: "skipping pinned repos"
  });
  const edges = data?.user?.pinnedItems?.edges ?? [];
  return edges.map(({ node: { repositoryTopics, ...rest } }) => ({
    ...rest,
    topics: (repositoryTopics?.nodes ?? []).map(t => t.topic.name)
  }));
}
