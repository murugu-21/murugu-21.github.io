// packages/contracts/mcp.ts declares each tool's name, schemas and annotations. Anything a model
// could fix by retrying with other arguments is an `isError` result, not a protocol error.

import type { McpServer, ToolCallback } from "@modelcontextprotocol/server";

import { CONTACT_DAILY_PER_CLIENT } from "@murugappan/contracts/api/contact.ts";
import {
  MCP_TOOLS,
  PostArgs,
  SearchArgs,
  SendMessageArgs,
  type McpToolDescriptor,
  type McpToolName
} from "@murugappan/contracts/mcp.ts";
import type { JsonRecord } from "@murugappan/utils/json.ts";
import { runInRequest, type RequestServices } from "#src/app.module.ts";
import type { Render } from "#src/common/di/render.ts";
import { ContactService, type ContactError } from "#src/modules/contact/contact.service.ts";
import { PostsService } from "#src/modules/posts/posts.service.ts";
import { ProfileService } from "#src/modules/profile/profile.service.ts";
import type { ContactLimitReached } from "#src/modules/rate-limit/contact-quota.repository.ts";
import type { ContactUsage } from "#src/modules/rate-limit/rate-limiter.durable-object.ts";
import { READ_LIMIT_MESSAGE, takeReadSlot } from "#src/modules/rate-limit/read-quota.store.ts";

export type ToolContext = {
  services: RequestServices;
  /** Keys the read window and the send_message allowance. */
  clientIp: string | undefined;
};

type ToolTextContent = { type: "text"; text: string };

type ToolResult = {
  content: ToolTextContent[];
  structuredContent?: unknown;
  isError?: boolean;
};

// The arguments the SDK passes a tool, already checked against its `inputSchema`.
type ToolArgs = Parameters<ToolCallback<McpToolDescriptor["inputSchema"]>>[0];

type Run = (
  args: ToolArgs,
  ctx: ToolContext,
  tool: McpToolDescriptor
) => ToolResult | Promise<ToolResult>;

/** The spec asks for the serialized JSON alongside structuredContent. */
function ok(data: JsonRecord): ToolResult {
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

const fromDataset: Run = (_args, { services }, tool) =>
  runInRequest({
    services,
    program: ProfileService.use(profile => profile.slice(tool.outputSchema)),
    render: { success: ok, failures: {} }
  });

/**
 * Spends one read from the client's REST read window, which the spec's rate limit on tool calls
 * and resource reads asks for. Like the REST guard, it counts nothing without a client address.
 * Returns why the read is refused, or null when it may go ahead.
 */
export function refusedRead(clientIp: string | undefined): string | null {
  const slot = clientIp ? takeReadSlot(clientIp) : null;
  if (!slot || slot.allowed) return null;
  return `${READ_LIMIT_MESSAGE} Wait ${slot.resetSeconds} seconds, then try again.`;
}

// send_message has its own allowance, so only the read tools are wrapped.
const readLimited =
  (run: Run): Run =>
  (args, ctx, tool) => {
    const refused = refusedRead(ctx.clientIp);
    return refused ? fail(refused) : run(args, ctx, tool);
  };

// Keyed by name, so a tool in the catalogue without a handler fails to compile.
const RUN: Record<McpToolName, Run> = {
  get_profile: fromDataset,
  list_experience: fromDataset,
  list_skills: fromDataset,
  list_education: fromDataset,
  list_open_source: fromDataset,
  search_blog_posts(args, { services }) {
    const { query, limit } = SearchArgs.parse(args);
    return runInRequest({
      services,
      program: PostsService.use(posts => posts.search({ query, limit })),
      render: { success: ok, failures: {} }
    });
  },
  get_blog_post(args, { services }) {
    const { slug } = PostArgs.parse(args);
    return runInRequest({
      services,
      program: PostsService.use(posts => posts.findBySlug(slug)),
      render: {
        success: ok,
        failures: {
          PostNotFound: () =>
            fail(
              `No published post has the slug '${slug}'. Call search_blog_posts to see which slugs exist.`
            )
        }
      }
    });
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
      services: ctx.services,
      program: ContactService.use(contact =>
        // Callers without an address share one allowance.
        contact.deliver({ client: ctx.clientIp ?? "unknown", message })
      ),
      render: sendMessageResults
    });
  }
};

export function registerTools(server: McpServer, ctx: ToolContext): void {
  for (const tool of MCP_TOOLS) {
    const run = tool.annotations.readOnlyHint ? readLimited(RUN[tool.name]) : RUN[tool.name];
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
