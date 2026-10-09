// MCP tool handlers. packages/contracts/mcp.ts declares each tool's name, schemas and annotations;
// these are thin adapters over the content the REST API serves (worker/content.ts). Anything a
// model could fix by retrying with other arguments is an `isError` result, not a protocol error.

import type { McpServer } from "@modelcontextprotocol/server";

import { CONTACT_DAILY_PER_CLIENT } from "@murugappan/contracts/api/contact.ts";
import { searchPosts } from "#worker/api/posts.ts";
import {
  MCP_TOOLS,
  PostArgs,
  SearchArgs,
  SendMessageArgs,
  type McpToolDescriptor,
  type McpToolName
} from "@murugappan/contracts/mcp.ts";
import { globalLimiter } from "#worker/api/ratelimit.ts";
import { DATASET, findPost, POSTS } from "#worker/content.ts";
import { contactMailer, sendContactEmail } from "#worker/email.ts";

export type ToolContext = {
  env: Env;
  /** Keys the send_message allowance. */
  clientIp: string;
};

type ToolTextContent = { type: "text"; text: string };

type ToolResult = {
  content: ToolTextContent[];
  structuredContent?: unknown;
  isError?: boolean;
};

type Run = (
  args: unknown,
  ctx: ToolContext,
  tool: McpToolDescriptor
) => ToolResult | Promise<ToolResult>;

/** The spec asks for the serialized JSON alongside structuredContent. */
function ok(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data
  };
}

function fail(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/** A dataset tool answers with the slice of the dataset its outputSchema picks. */
const fromDataset: Run = (_args, _ctx, tool) => ok(tool.outputSchema.parse(DATASET));

// Keyed by name, so a tool in the catalogue without a handler fails to compile.
const RUN: Record<McpToolName, Run> = {
  get_profile: fromDataset,
  list_experience: fromDataset,
  list_skills: fromDataset,
  list_education: fromDataset,
  list_open_source: fromDataset,
  search_blog_posts(args) {
    const { query, limit } = SearchArgs.parse(args);
    const posts = searchPosts({ posts: POSTS, query, limit });
    return ok({ posts, count: posts.length });
  },
  get_blog_post(args) {
    const { slug } = PostArgs.parse(args);
    const post = findPost(slug);
    if (post) return ok(post);
    return fail(
      `No published post has the slug '${slug}'. Call search_blog_posts to see which slugs exist.`
    );
  },
  async send_message(args, ctx) {
    const { dryRun, ...msg } = SendMessageArgs.parse(args);
    if (dryRun) {
      return ok({
        status: "validated",
        message: "The request is valid. Call again without dryRun to deliver it."
      });
    }

    const mailer = contactMailer(ctx.env);
    if (!mailer)
      return fail(
        "Message delivery is not configured on this deployment. Use one of the contact links from get_profile instead."
      );

    // Without this catch the SDK would send the raw error message as the isError text and log nothing.
    try {
      const slot = await globalLimiter(ctx.env).takeContactSlot(ctx.clientIp);
      if (!slot.allowed)
        return fail(
          slot.scope === "client"
            ? `This client has already used its daily allowance of ${CONTACT_DAILY_PER_CLIENT} messages. It resets at 00:00 UTC. Until then, use one of the contact links from get_profile.`
            : "The site-wide daily message allowance is spent. It resets at 00:00 UTC. Until then, use one of the contact links from get_profile."
        );
      await sendContactEmail({ ...mailer, msg });
    } catch (err) {
      console.error("mcp send_message failed", err);
      return fail(
        "The message could not be delivered right now. Retry in a few minutes, or use one of the contact links from get_profile."
      );
    }
    return ok({
      status: "accepted",
      message: "Message accepted. Murugappan will reply to the address you gave."
    });
  }
};

export function registerTools(server: McpServer, ctx: ToolContext): void {
  for (const tool of MCP_TOOLS) {
    const run = RUN[tool.name];
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations
      },
      args => run(args, ctx, tool)
    );
  }
}
