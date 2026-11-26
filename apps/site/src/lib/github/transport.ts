import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

import { nonEmpty } from "@murugappan/utils/text.ts";

const GraphqlReply = z.object({
  data: z.unknown(),
  errors: z.array(z.object({ message: z.string() })).optional()
});
export type GraphqlReply = z.infer<typeof GraphqlReply>;

export class GithubFailure extends Error {
  override readonly name: string = "GithubFailure";

  constructor(
    message: string,
    readonly detail: unknown[] = []
  ) {
    super(message);
  }
}

export class GithubAuthFailure extends GithubFailure {
  override readonly name = "GithubAuthFailure";
}

export interface GithubTransport {
  query(query: string): Promise<GraphqlReply>;
}

function parseReply(body: string): GraphqlReply {
  try {
    return GraphqlReply.parse(JSON.parse(body));
  } catch (e) {
    throw new GithubFailure("unreadable reply", [e]);
  }
}

export class HttpsTransport implements GithubTransport {
  constructor(private readonly token: string) {}

  async query(query: string): Promise<GraphqlReply> {
    let res: Response;
    try {
      res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "User-Agent": "astro-build" },
        body: JSON.stringify({ query })
      });
    } catch (e) {
      throw new GithubFailure("fetch failed", [e]);
    }
    if (res.status === 401) throw new GithubAuthFailure("GitHub rejected GITHUB_TOKEN (HTTP 401)");
    if (!res.ok) throw new GithubFailure(`GraphQL HTTP ${res.status}`);
    return parseReply(await res.text());
  }
}

const runFile = promisify(execFile);

const ExecError = z.object({
  code: z.union([z.number(), z.string()]).nullish(),
  signal: z.string().nullish(),
  stderr: z
    .string()
    .optional()
    .transform(stderr => nonEmpty(stderr?.trim())),
  message: z.string()
});

const GH_EXIT_AUTH = 4;

export class GhCliTransport implements GithubTransport {
  constructor(private readonly timeoutMs = 30_000) {}

  async query(query: string): Promise<GraphqlReply> {
    let stdout: string;
    try {
      ({ stdout } = await runFile("gh", ["api", "graphql", "-f", `query=${query}`], {
        timeout: this.timeoutMs
      }));
    } catch (e) {
      const { code, signal, stderr, message } = ExecError.parse(e);
      if (code === "ENOENT") {
        throw new GithubAuthFailure("gh is not installed; install it and run gh auth login");
      }
      const detail = stderr ?? message;
      if (code === GH_EXIT_AUTH) {
        throw new GithubAuthFailure("gh is not logged in; run gh auth login", [detail]);
      }
      if (detail.includes("(HTTP 401)")) {
        throw new GithubAuthFailure(
          "GitHub rejected gh's login (HTTP 401); run gh auth login, or unset an expired GH_TOKEN",
          [detail]
        );
      }
      throw new GithubFailure(`gh failed (${code ?? signal})`, [detail]);
    }
    return parseReply(stdout);
  }
}
