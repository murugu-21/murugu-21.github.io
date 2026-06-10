export interface GithubProfile {
  name: string;
  bio: string | null;
  avatarUrl: string;
  location: string | null;
}

/** Build-time fetch of the GitHub profile. Returns null on any failure so the build never breaks. */
export async function fetchGithubProfile(): Promise<GithubProfile | null> {
  const token = process.env.GITHUB_TOKEN ?? process.env.REACT_APP_GITHUB_TOKEN;
  if (!token) {
    console.warn("[github] no GITHUB_TOKEN — rendering contact fallback");
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
      return null;
    }
    const json = await res.json();
    if (json.errors) {
      console.warn(
        "[github] GraphQL errors — rendering contact fallback",
        json.errors.map((e: {message: string}) => e.message)
      );
      return null;
    }
    return json?.data?.user ?? null;
  } catch (e) {
    console.warn("[github] fetch failed — rendering contact fallback", e);
    return null;
  }
}
