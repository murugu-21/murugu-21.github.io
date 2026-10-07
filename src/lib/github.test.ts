import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const RequestBody = z.object({ query: z.string() });

type Reply = { status?: number; body: unknown } | Error;

let requests: { url: string; init: RequestInit | undefined }[] = [];

function stubGithub(reply: Reply) {
  requests = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  });
}

async function loadGithub({
  token = "tok",
  required = "0"
}: {
  token?: string;
  required?: string;
}) {
  vi.resetModules();
  vi.doMock("astro:env/server", () => ({
    GITHUB_TOKEN: token || undefined,
    REQUIRE_GITHUB_PROFILE: required
  }));
  return import("./github");
}

const sentQuery = () =>
  RequestBody.parse(JSON.parse(z.string().parse(requests[0]?.init?.body))).query;

let warnings: unknown[][] = [];

beforeEach(() => {
  warnings = [];
  vi.spyOn(console, "warn").mockImplementation((...args) => void warnings.push(args));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchGithubProfile", () => {
  it("posts the profile query with the token and returns the bio", async () => {
    stubGithub({ body: { data: { user: { bio: "Full stack engineer" } } } });
    const { fetchGithubProfile } = await loadGithub({});

    expect(await fetchGithubProfile()).toEqual({ bio: "Full stack engineer" });
    expect(requests[0]?.url).toBe("https://api.github.com/graphql");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[0]?.init?.headers).toEqual({
      Authorization: "Bearer tok",
      "User-Agent": "astro-build"
    });
    expect(sentQuery()).toBe(`{ user(login: "murugu-21") { bio } }`);
  });

  it("skips the request without a token and says why", async () => {
    stubGithub({ body: { data: { user: { bio: "never read" } } } });
    const { fetchGithubProfile } = await loadGithub({ token: "" });

    expect(await fetchGithubProfile()).toBeNull();
    expect(requests).toEqual([]);
    expect(warnings).toEqual([["[github] no GITHUB_TOKEN; rendering contact fallback"]]);
  });

  it.each<{ name: string; reply: Reply; warning: string }>([
    {
      name: "an HTTP error",
      reply: { status: 502, body: {} },
      warning: "[github] GraphQL HTTP 502; rendering contact fallback"
    },
    {
      name: "GraphQL errors",
      reply: { body: { data: null, errors: [{ message: "Bad credentials" }] } },
      warning: "[github] GraphQL errors; rendering contact fallback"
    },
    {
      name: "data of the wrong shape",
      reply: { body: { data: { user: { bio: 5 } } } },
      warning: "[github] unexpected GraphQL data; rendering contact fallback"
    },
    {
      name: "a network failure",
      reply: new Error("offline"),
      warning: "[github] fetch failed; rendering contact fallback"
    }
  ])("falls back to null on $name instead of breaking the build", async ({ reply, warning }) => {
    stubGithub(reply);
    const { fetchGithubProfile } = await loadGithub({});

    expect(await fetchGithubProfile()).toBeNull();
    expect(warnings[0]?.[0]).toBe(warning);
  });

  it("logs the GraphQL error messages", async () => {
    stubGithub({ body: { data: null, errors: [{ message: "Bad credentials" }] } });
    const { fetchGithubProfile } = await loadGithub({});

    await fetchGithubProfile();
    expect(warnings[0]?.[1]).toEqual(["Bad credentials"]);
  });

  it("returns null when the user does not exist, unless the profile is required", async () => {
    stubGithub({ body: { data: { user: null } } });
    const optional = await loadGithub({});
    expect(await optional.fetchGithubProfile()).toBeNull();

    const required = await loadGithub({ required: "1" });
    await expect(required.fetchGithubProfile()).rejects.toThrow(
      "[github] profile fetch failed but REQUIRE_GITHUB_PROFILE=1"
    );
  });
});

describe("fetchPinnedRepos", () => {
  const node = {
    name: "portfolio",
    description: null,
    url: "https://github.com/murugu-21/portfolio",
    homepageUrl: "https://murugappan.dev",
    forkCount: 2,
    diskUsage: 2048,
    primaryLanguage: { name: "TypeScript", color: "#3178c6" },
    stargazers: { totalCount: 7 }
  };

  it("flattens each repository's topics into a name list", async () => {
    stubGithub({
      body: {
        data: {
          user: {
            pinnedItems: {
              edges: [
                { node: { ...node, repositoryTopics: { nodes: [{ topic: { name: "astro" } }] } } },
                { node: { ...node, name: "no-topics" } }
              ]
            }
          }
        }
      }
    });
    const { fetchPinnedRepos } = await loadGithub({});

    const repos = await fetchPinnedRepos();

    expect(repos).toEqual([
      { ...node, topics: ["astro"] },
      { ...node, name: "no-topics", topics: [] }
    ]);
    expect(sentQuery()).toContain("pinnedItems(first: 6, types: REPOSITORY)");
  });

  it("is an empty list when the query fails", async () => {
    stubGithub({ status: 500, body: {} });
    const { fetchPinnedRepos } = await loadGithub({});

    expect(await fetchPinnedRepos()).toEqual([]);
    expect(warnings[0]?.[0]).toBe("[github] GraphQL HTTP 500; skipping pinned repos");
  });
});

describe("formatRepoSize", () => {
  it.each([
    [512, "512 KB"],
    [1024, "1 MB"],
    [2560, "2.5 MB"]
  ])("formats %i KB as %s", async (kb, expected) => {
    const { formatRepoSize } = await loadGithub({});
    expect(formatRepoSize(kb)).toBe(expected);
  });
});
