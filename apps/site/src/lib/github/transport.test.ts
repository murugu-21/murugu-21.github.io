import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { emptyPath, fakeGh } from "#src/test/fake-gh.ts";
import { GhCliTransport, HttpsTransport } from "./transport";

const QUERY = `{ viewer { login } }`;
const REPLY = { data: { viewer: { login: "murugu-21" } } };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("HttpsTransport", () => {
  const https = new HttpsTransport("tok");

  it("posts the query with the token and returns GitHub's reply", async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      return Response.json(REPLY);
    });

    expect(await https.query(QUERY)).toEqual(REPLY);
    expect(requests).toEqual([
      {
        url: "https://api.github.com/graphql",
        init: {
          method: "POST",
          headers: { Authorization: "Bearer tok", "User-Agent": "astro-build" },
          body: JSON.stringify({ query: QUERY })
        }
      }
    ]);
  });

  it("fails with the HTTP status", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 502 }));

    await expect(https.query(QUERY)).rejects.toMatchObject({
      message: "GraphQL HTTP 502",
      detail: []
    });
  });

  it("fails with the network error", async () => {
    const offline = new Error("offline");
    vi.stubGlobal("fetch", async () => {
      throw offline;
    });

    await expect(https.query(QUERY)).rejects.toMatchObject({
      message: "fetch failed",
      detail: [offline]
    });
  });
});

describe("GhCliTransport", () => {
  const gh = new GhCliTransport();

  it("sends the query through gh api and returns GitHub's reply", async () => {
    const fake = await fakeGh({ stdout: JSON.stringify(REPLY) });

    expect(await gh.query(QUERY)).toEqual(REPLY);
    expect(await fake.args()).toEqual(["api", "graphql", "-f", `query=${QUERY}`]);
  });

  it("fails with gh's exit code and stderr when gh is not logged in", async () => {
    await fakeGh({
      status: 4,
      stderr: "To get started with GitHub CLI, please run:  gh auth login\n"
    });

    await expect(gh.query(QUERY)).rejects.toMatchObject({
      name: "GithubFailure",
      message: "gh failed (4)",
      detail: ["To get started with GitHub CLI, please run:  gh auth login"]
    });
  });

  it("fails with gh's exit code and stderr when gh rejects the query", async () => {
    await fakeGh({ status: 1, stderr: "gh: Field 'x' doesn't exist\n" });

    await expect(gh.query(QUERY)).rejects.toMatchObject({
      name: "GithubFailure",
      message: "gh failed (1)",
      detail: ["gh: Field 'x' doesn't exist"]
    });
  });

  it("keeps the exec error message when gh exits without stderr", async () => {
    await fakeGh({ status: 1 });

    await expect(gh.query(QUERY)).rejects.toMatchObject({
      message: "gh failed (1)",
      detail: [expect.stringContaining("Command failed: gh api graphql")]
    });
  });

  it("fails with ENOENT when gh is not installed", async () => {
    await emptyPath();

    await expect(gh.query(QUERY)).rejects.toMatchObject({
      name: "GithubFailure",
      message: "gh failed (ENOENT)",
      detail: ["spawn gh ENOENT"]
    });
  });

  it("gives up when gh runs past its timeout", async () => {
    await fakeGh({ stdout: JSON.stringify(REPLY), delaySeconds: 5 });

    await expect(new GhCliTransport(100).query(QUERY)).rejects.toMatchObject({
      message: "gh failed (SIGTERM)"
    });
  });

  it("fails as an unreadable reply when gh prints something other than JSON", async () => {
    await fakeGh({ stdout: "Welcome to gh!" });

    await expect(gh.query(QUERY)).rejects.toMatchObject({
      message: "unreadable reply",
      detail: [expect.any(SyntaxError)]
    });
  });
});
