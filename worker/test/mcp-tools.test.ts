import {env} from "cloudflare:test";
import {describe, expect, it} from "vitest";

import {CONTACT_DAILY_PER_CLIENT} from "../api/contact";
import {MCP_TOOLS, findTool, type ToolContext} from "../mcp/tools";
import {fakeAssets, POST_MARKDOWN} from "./fixtures";

function ctx(
  options: {
    assets?: Record<string, string | null>;
    inbox?: string | null;
    email?: {send(msg: unknown): Promise<unknown>} | null;
    ip?: string;
  } = {}
): ToolContext {
  return {
    assets: fakeAssets(options.assets),
    env: {
      ...env,
      OPPORTUNITY_INBOX:
        options.inbox === undefined ? "inbox@example.com" : options.inbox,
      EMAIL:
        options.email === undefined
          ? {send: () => Promise.resolve()}
          : options.email
    } as unknown as Env,
    clientIp: options.ip ?? "203.0.113.50"
  };
}

async function call(
  name: string,
  args: Record<string, unknown> = {},
  options?: Parameters<typeof ctx>[0]
) {
  const tool = findTool(name);
  if (!tool) throw new Error(`no such tool: ${name}`);
  return tool.run(args, ctx(options));
}

function hasRef(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasRef);
  if (typeof node === "object" && node !== null)
    return Object.entries(node).some(([k, v]) => k === "$ref" || hasRef(v));
  return false;
}

describe("MCP_TOOLS definitions", () => {
  it("exposes a tool for every documented capability", () => {
    expect(MCP_TOOLS.map(t => t.name)).toEqual([
      "get_profile",
      "list_experience",
      "list_skills",
      "list_education",
      "list_open_source",
      "search_blog_posts",
      "get_blog_post",
      "send_message"
    ]);
  });

  it("uses names within the character set and length the spec allows", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.name, tool.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
    }
  });

  it("gives every tool a unique name", () => {
    const names = MCP_TOOLS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every tool a title and a substantive description", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.description.length, tool.name).toBeGreaterThan(60);
    }
  });

  it("declares a valid object inputSchema for every tool", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.inputSchema.type, tool.name).toBe("object");
      expect(hasRef(tool.inputSchema), tool.name).toBe(false);
    }
  });

  it("closes the schema of a tool that takes no arguments", () => {
    const tool = findTool("get_profile")!;
    expect(tool.inputSchema).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false
    });
  });

  it("declares a self-contained outputSchema for every tool", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.outputSchema, tool.name).toBeTruthy();
      expect(hasRef(tool.outputSchema), tool.name).toBe(false);
      expect(tool.outputSchema!.type, tool.name).toBe("object");
    }
  });

  it("describes every input property", () => {
    for (const tool of MCP_TOOLS) {
      const props = (tool.inputSchema.properties ?? {}) as Record<
        string,
        {description?: string}
      >;
      for (const [name, schema] of Object.entries(props)) {
        expect(schema.description, `${tool.name}.${name}`).toBeTruthy();
      }
    }
  });

  it("marks the read tools read-only and the write tool not", () => {
    for (const tool of MCP_TOOLS) {
      const readOnly = tool.name !== "send_message";
      expect(tool.annotations.readOnlyHint, tool.name).toBe(readOnly);
      expect(tool.annotations.destructiveHint, tool.name).toBe(false);
    }
  });
});

describe("findTool", () => {
  it("finds a tool by exact name", () => {
    expect(findTool("get_profile")?.name).toBe("get_profile");
  });

  it("is case-sensitive and returns undefined for anything else", () => {
    expect(findTool("Get_Profile")).toBeUndefined();
    expect(findTool("nope")).toBeUndefined();
  });
});

describe("read tools", () => {
  it("get_profile returns the person and links as structured content", async () => {
    const result = await call("get_profile");
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as {
      person: {name: string};
      links: unknown[];
    };
    expect(data.person.name).toBe("Murugappan M");
    expect(data.links.length).toBeGreaterThan(0);
    // The spec asks for the serialized JSON in a text block too.
    expect(JSON.parse(result.content[0].text)).toEqual(data);
  });

  it("list_experience returns dated roles", async () => {
    const data = (await call("list_experience")).structuredContent as {
      experience: Array<{company: string; startDate: string}>;
    };
    expect(data.experience[0]).toMatchObject({
      company: "MedMe Health",
      startDate: "2025-12"
    });
  });

  it("list_skills returns categories and proficiencies", async () => {
    const data = (await call("list_skills")).structuredContent as {
      skills: Array<{skills: string[]}>;
      proficiencies: unknown[];
    };
    expect(data.skills[0].skills).toEqual(["TypeScript", "Python"]);
    expect(data.proficiencies).toHaveLength(1);
  });

  it("list_education returns the degree", async () => {
    const data = (await call("list_education")).structuredContent as {
      education: Array<{institution: string}>;
    };
    expect(data.education[0].institution).toBe(
      "Kumaraguru College of Technology"
    );
  });

  it("list_open_source returns verifiable links", async () => {
    const data = (await call("list_open_source")).structuredContent as {
      openSource: Array<{project: string}>;
    };
    expect(data.openSource[0].project).toBe("AnkiDroid");
  });

  it("reports a missing dataset as a tool execution error, not a throw", async () => {
    const result = await call(
      "get_profile",
      {},
      {
        assets: {"/api/dataset.json": null}
      }
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not available/i);
  });
});

describe("search_blog_posts", () => {
  it("lists every post by default", async () => {
    const data = (await call("search_blog_posts")).structuredContent as {
      posts: unknown[];
      count: number;
    };
    expect(data.count).toBe(2);
  });

  it("filters case-insensitively", async () => {
    const data = (await call("search_blog_posts", {query: "RATE LIMITING"}))
      .structuredContent as {posts: Array<{slug: string}>; count: number};
    expect(data.count).toBe(1);
    expect(data.posts[0].slug).toBe("cloud-agnostic-rate-limiting");
  });

  it("applies limit", async () => {
    const data = (await call("search_blog_posts", {limit: 1}))
      .structuredContent as {count: number};
    expect(data.count).toBe(1);
  });

  it("rejects an out-of-range limit as a tool execution error", async () => {
    const result = await call("search_blog_posts", {limit: 0});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/limit/);
  });

  it("rejects a non-string query", async () => {
    const result = await call("search_blog_posts", {query: 42});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/query/);
  });

  it("returns an empty list when nothing matches", async () => {
    const data = (await call("search_blog_posts", {query: "kubernetes"}))
      .structuredContent as {count: number};
    expect(data.count).toBe(0);
  });
});

describe("get_blog_post", () => {
  it("returns the post markdown", async () => {
    const data = (await call("get_blog_post", {slug: "coin-change-problem"}))
      .structuredContent as {markdown: string; title: string};
    expect(data.title).toBe("Coin Change Problem");
    expect(data.markdown).toBe(POST_MARKDOWN);
  });

  it("tells the model how to recover from an unknown slug", async () => {
    const result = await call("get_blog_post", {slug: "nope"});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("search_blog_posts");
  });

  it("rejects a missing slug", async () => {
    const result = await call("get_blog_post", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/slug/);
  });

  it("rejects a traversal attempt", async () => {
    const result = await call("get_blog_post", {slug: "../../llms.txt"});
    expect(result.isError).toBe(true);
  });
});

describe("send_message", () => {
  const message = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    message: "We are hiring a senior backend engineer for a data platform."
  };

  it("sends the message and confirms acceptance", async () => {
    const sent: Array<{to: string; subject: string}> = [];
    const result = await call("send_message", message, {
      ip: "198.51.100.60",
      email: {send: async m => void sent.push(m as (typeof sent)[number])}
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      status: "accepted",
      message:
        "Message accepted — Murugappan will reply to the address you gave."
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("Ada Lovelace");
  });

  it("validates without sending when dryRun is set", async () => {
    const sent: unknown[] = [];
    const result = await call(
      "send_message",
      {...message, dryRun: true},
      {ip: "198.51.100.61", email: {send: async m => void sent.push(m)}}
    );
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as {status: string}).status).toBe(
      "validated"
    );
    expect(sent).toEqual([]);
  });

  it("reports each invalid field so the model can self-correct", async () => {
    const result = await call(
      "send_message",
      {email: "nope", message: "hi"},
      {ip: "198.51.100.62"}
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("email");
    expect(result.content[0].text).toContain("message");
  });

  it("shares the daily allowance with POST /api/contact", async () => {
    for (let i = 0; i < CONTACT_DAILY_PER_CLIENT; i++) {
      const ok = await call("send_message", message, {ip: "198.51.100.63"});
      expect(ok.isError).toBeFalsy();
    }
    const result = await call("send_message", message, {ip: "198.51.100.63"});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/allowance|limit/i);
  });

  it("reports an unconfigured inbox as a tool execution error", async () => {
    const result = await call("send_message", message, {
      ip: "198.51.100.64",
      inbox: null
    });
    expect(result.isError).toBe(true);
  });

  it("reports a failed delivery as a tool execution error", async () => {
    const result = await call("send_message", message, {
      ip: "198.51.100.65",
      email: {send: () => Promise.reject(new Error("relay down"))}
    });
    expect(result.isError).toBe(true);
  });
});
