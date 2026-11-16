import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

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
    if (!res.ok) throw new GithubFailure(`GraphQL HTTP ${res.status}`);
    return parseReply(await res.text());
  }
}

const runFile = promisify(execFile);

const ExecError = z.object({
  code: z.union([z.number(), z.string()]).nullish(),
  signal: z.string().nullish(),
  stderr: z.string().optional(),
  message: z.string()
});

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
      const detail = stderr?.trim() || message;
      throw new GithubFailure(`gh failed (${code ?? signal})`, [detail]);
    }
    return parseReply(stdout);
  }
}
