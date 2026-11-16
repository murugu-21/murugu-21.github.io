import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { GithubClient } from "./client";
import { GithubFailure, type GithubTransport, type GraphqlReply } from "./transport";

function answering(reply: GraphqlReply) {
  const queries: string[] = [];
  const transport: GithubTransport = {
    query: async query => {
      queries.push(query);
      return reply;
    }
  };
  return { client: new GithubClient(transport), queries };
}

function failing(error: Error): GithubClient {
  const transport: GithubTransport = {
    query: async () => {
      throw error;
    }
  };
  return new GithubClient(transport);
}

let warnings: unknown[][] = [];

beforeEach(() => {
  warnings = [];
  vi.spyOn(console, "warn").mockImplementation((...args) => void warnings.push(args));
});

afterEach(() => vi.restoreAllMocks());

describe("profile", () => {
  it("asks for the bio, and is null without a warning when the user doesn't exist", async () => {
    const found = answering({ data: { user: { bio: "Full stack engineer" } } });
    expect(await found.client.profile()).toEqual({ bio: "Full stack engineer" });
    expect(found.queries).toEqual([expect.stringContaining("bio")]);

    expect(await answering({ data: { user: null } }).client.profile()).toBeNull();
    expect(warnings).toEqual([]);
  });

  it.each<{ name: string; client: GithubClient; warning: unknown[] }>([
    {
      name: "GraphQL errors",
      client: answering({ data: null, errors: [{ message: "Bad credentials" }] }).client,
      warning: ["[github] GraphQL errors; rendering contact fallback", ["Bad credentials"]]
    },
    {
      name: "data of the wrong shape",
      client: answering({ data: { user: { bio: 5 } } }).client,
      warning: [
        "[github] unexpected GraphQL data; rendering contact fallback",
        [expect.objectContaining({ path: ["user", "bio"] })]
      ]
    },
    {
      name: "a transport failure",
      client: failing(new GithubFailure("gh failed (1)", ["gh: Field 'x' doesn't exist"])),
      warning: ["[github] gh failed (1); rendering contact fallback", "gh: Field 'x' doesn't exist"]
    }
  ])("falls back to null on $name and logs why", async ({ client, warning }) => {
    expect(await client.profile()).toBeNull();
    expect(warnings).toEqual([warning]);
  });
});

describe("pinnedRepos", () => {
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

  const pinned = (...nodes: object[]) =>
    answering({ data: { user: { pinnedItems: { edges: nodes.map(n => ({ node: n })) } } } });

  it("asks for the pinned repositories and flattens each one's topics into a name list", async () => {
    const { client, queries } = pinned(
      { ...node, repositoryTopics: { nodes: [{ topic: { name: "astro" } }] } },
      { ...node, name: "no-topics" }
    );

    expect(await client.pinnedRepos()).toEqual([
      { ...node, topics: ["astro"] },
      { ...node, name: "no-topics", topics: [] }
    ]);
    expect(queries).toEqual([expect.stringContaining("pinnedItems(first: 6, types: REPOSITORY)")]);
  });

  it("is an empty list when the query fails, and logs why", async () => {
    expect(await failing(new GithubFailure("GraphQL HTTP 500")).pinnedRepos()).toEqual([]);
    expect(warnings).toEqual([["[github] GraphQL HTTP 500; skipping pinned repos"]]);
  });

  it("keeps only described repositories as resume projects", async () => {
    const { client } = pinned(
      { ...node, name: "described", description: "This site." },
      { ...node, name: "blank", description: "" },
      node
    );

    expect((await client.resumeProjects()).map(repo => repo.name)).toEqual(["described"]);
  });
});

it.each([
  { method: "profile", error: new TypeError("bug") },
  { method: "pinnedRepos", error: new TypeError("bug") }
] as const)(
  "$method fails the build on $error.name instead of falling back",
  async ({ method, error }) => {
    await expect(failing(error)[method]()).rejects.toThrow(error.message);
    expect(warnings).toEqual([]);
  }
);
