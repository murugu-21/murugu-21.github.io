// packages/contracts/mcp.ts declares each tool's name, schemas and annotations. Anything a model
// could fix by retrying with other arguments is an `isError` result, not a protocol error.

import type { McpServer } from "@modelcontextprotocol/server";

import { CONTACT_DAILY_PER_CLIENT } from "@murugappan/contracts/api/contact.ts";
import { searchPosts } from "#src/api/posts.ts";
import {
  MCP_TOOLS,
  PostArgs,
  SearchArgs,
  SendMessageArgs,
  type McpToolDescriptor,
  type McpToolName
} from "@murugappan/contracts/mcp.ts";
import { DATASET, findPost, POSTS } from "#src/content.ts";
import {
  deliverContact,
  type ContactError,
  type ContactLimitReached
} from "#src/programs/contact-delivery.ts";
import { runInRequest, type Render } from "#src/programs/run-in-request.ts";
import type { ContactUsage } from "#src/rate-limiter.ts";

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

const LIMIT_TEXT = {
  client: `This client has already used its daily allowance of ${CONTACT_DAILY_PER_CLIENT} messages. It resets at 00:00 UTC. Until then, use one of the contact links from get_profile.`,
  global:
    "The site-wide daily message allowance is spent. It resets at 00:00 UTC. Until then, use one of the contact links from get_profile."
} as const satisfies Record<ContactLimitReached["scope"], string>;

// Otherwise the SDK would send the raw error message as the isError text and log nothing.
function undelivered(cause: unknown): ToolResult {
  console.error("mcp send_message failed", cause);
  return fail(
    "The message could not be delivered right now. Retry in a few minutes, or use one of the contact links from get_profile."
  );
}

const sendMessageResults: Render<ContactUsage, ContactError, ToolResult> = {
  success: () =>
    ok({
      status: "accepted",
      message: "Message accepted. Murugappan will reply to the address you gave."
    }),
  failures: {
    DeliveryNotConfigured: () =>
      fail(
        "Message delivery is not configured on this deployment. Use one of the contact links from get_profile instead."
      ),
    ContactLimitReached: ({ scope }) => fail(LIMIT_TEXT[scope]),
    DeliveryFailed: ({ cause }) => undelivered(cause),
    QuotaUnavailable: ({ cause }) => undelivered(cause)
  }
};

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
    const { dryRun, ...message } = SendMessageArgs.parse(args);
    if (dryRun) {
      return ok({
        status: "validated",
        message: "The request is valid. Call again without dryRun to deliver it."
      });
    }
    return runInRequest({
      env: ctx.env,
      program: deliverContact({ client: ctx.clientIp, message }),
      render: sendMessageResults
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
