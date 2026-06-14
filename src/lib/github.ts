const REQUIRED = process.env.REQUIRE_GITHUB_PROFILE === "1";

export interface GithubProfile {
  name: string;
  bio: string | null;
  avatarUrl: string;
  location: string | null;
}

/** Build-time fetch of the GitHub profile. Returns null on any failure so the build never breaks. */
export async function fetchGithubProfile(): Promise<GithubProfile | null> {
  // Astro/Vite surfaces .env (and build-time env) via import.meta.env, not
  // process.env, for SSR — check it first so a token in .env works in dev and
  // in the production build; fall back to process.env for plain-node contexts.
  const meta = import.meta.env as unknown as Record<string, string | undefined>;
  const token =
    meta.GITHUB_TOKEN ??
    meta.REACT_APP_GITHUB_TOKEN ??
    process.env.GITHUB_TOKEN ??
    process.env.REACT_APP_GITHUB_TOKEN;
  if (!token) {
    console.warn("[github] no GITHUB_TOKEN — rendering contact fallback");
    if (REQUIRED)
      throw new Error(
        "[github] profile fetch failed but REQUIRE_GITHUB_PROFILE=1"
      );
    return null;
  }
  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {Authorization: `Bearer ${token}`, "User-Agent": "astro-build"},
      body: JSON.stringify({
        query: `{ user(login: "murugu-21") { name bio avatarUrl location } }`
      })
    });
    if (!res.ok) {
      console.warn(
        `[github] GraphQL HTTP ${res.status} — rendering contact fallback`
      );
      if (REQUIRED)
        throw new Error(
          "[github] profile fetch failed but REQUIRE_GITHUB_PROFILE=1"
        );
      return null;
    }
    const json = await res.json();
    if (json.errors) {
      console.warn(
        "[github] GraphQL errors — rendering contact fallback",
        json.errors.map((e: {message: string}) => e.message)
      );
      if (REQUIRED)
        throw new Error(
          "[github] profile fetch failed but REQUIRE_GITHUB_PROFILE=1"
        );
      return null;
    }
    const user = json?.data?.user ?? null;
    if (!user && REQUIRED)
      throw new Error(
        "[github] profile fetch failed but REQUIRE_GITHUB_PROFILE=1"
      );
    return user;
  } catch (e) {
    if (e instanceof Error && e.message.includes("REQUIRE_GITHUB_PROFILE"))
      throw e;
    console.warn("[github] fetch failed — rendering contact fallback", e);
    if (REQUIRED)
      throw new Error(
        "[github] profile fetch failed but REQUIRE_GITHUB_PROFILE=1"
      );
    return null;
  }
}

export interface GithubRepo {
  id: string;
  name: string;
  description: string | null;
  url: string;
  forkCount: number;
  diskUsage: number;
  primaryLanguage: {name: string; color: string} | null;
  stargazers: {totalCount: number};
  topics: string[];
}

/** GitHub's diskUsage is in KB; show KB under 1 MB, else MB (matches the old developerFolio card). */
export function formatRepoSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  return `${parseFloat((kb / 1024).toFixed(1))} MB`;
}

/** Build-time fetch of pinned repositories. Returns [] on any failure so the build never breaks. */
export async function fetchPinnedRepos(): Promise<GithubRepo[]> {
  // Astro/Vite surfaces .env (and build-time env) via import.meta.env, not
  // process.env, for SSR — check it first so a token in .env works in dev and
  // in the production build; fall back to process.env for plain-node contexts.
  const meta = import.meta.env as unknown as Record<string, string | undefined>;
  const token =
    meta.GITHUB_TOKEN ??
    meta.REACT_APP_GITHUB_TOKEN ??
    process.env.GITHUB_TOKEN ??
    process.env.REACT_APP_GITHUB_TOKEN;
  if (!token) {
    console.warn("[github] no GITHUB_TOKEN — skipping pinned repos");
    return [];
  }
  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {Authorization: `Bearer ${token}`, "User-Agent": "astro-build"},
      body: JSON.stringify({
        query: `{ user(login: "murugu-21") { pinnedItems(first: 6, types: REPOSITORY) { edges { node { ... on Repository {
          id name description url forkCount diskUsage
          primaryLanguage { name color }
          stargazers { totalCount }
          repositoryTopics(first: 12) { nodes { topic { name } } }
        } } } } } }`
      })
    });
    if (!res.ok) {
      console.warn(`[github] pinned repos HTTP ${res.status} — skipping`);
      return [];
    }
    const json = await res.json();
    if (json.errors) {
      console.warn(
        "[github] pinned repos GraphQL errors — skipping",
        json.errors.map((e: {message: string}) => e.message)
      );
      return [];
    }
    const edges = (json?.data?.user?.pinnedItems?.edges ?? []) as {
      node: Omit<GithubRepo, "topics"> & {
        repositoryTopics?: {nodes?: {topic: {name: string}}[]};
      };
    }[];
    // Flatten repositoryTopics.nodes[].topic.name → string[] so the card just
    // reads repo.topics.
    return edges
      .map(e => e.node)
      .filter(Boolean)
      .map(({repositoryTopics, ...rest}) => ({
        ...rest,
        topics: (repositoryTopics?.nodes ?? []).map(t => t.topic.name)
      }));
  } catch (e) {
    console.warn("[github] pinned repos fetch failed — skipping", e);
    return [];
  }
}
