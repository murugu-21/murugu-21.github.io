// MCP tools are thin adapters over the REST API's loaders and share its zod schemas,
// which the SDK validates with and turns into each tool's JSON Schema. Anything a model
// could fix by retrying with other arguments is an `isError` result, not a protocol error.

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { CONTACT_DAILY_PER_CLIENT, ContactAccepted, ContactRequest } from "#worker/api/contact.ts";
import {
  EducationList,
  ExperienceList,
  OpenSourceList,
  Profile,
  SkillsResponse,
  type Dataset
} from "#worker/api/dataset.ts";
import { Post, PostList, POSTS_LIMIT_MAX, searchPosts, SLUG } from "#worker/api/posts.ts";
import { globalLimiter } from "#worker/api/ratelimit.ts";
import { loadDataset, loadPost, loadPosts, type AssetsLike } from "#worker/api/store.ts";
import { contactMailer, sendContactEmail } from "#worker/email.ts";

export type ToolContext = {
  assets: AssetsLike;
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

type ToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  annotations: ToolAnnotations;
  run(args: unknown, ctx: ToolContext): Promise<ToolResult>;
};

const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

const NO_ARGS = z.strictObject({});

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

const DATASET_UNAVAILABLE =
  "The site's content dataset is not available right now. This is a transient deployment state. Retry in a minute, or read https://murugappan.dev/llms.txt instead.";

function datasetTool({
  name,
  title,
  description,
  schema,
  project
}: {
  name: string;
  title: string;
  description: string;
  schema: z.ZodType;
  project: (data: Dataset) => unknown;
}): McpTool {
  return {
    name,
    title,
    description,
    inputSchema: NO_ARGS,
    outputSchema: schema,
    annotations: READ_ONLY,
    async run(_args, ctx) {
      const data = await loadDataset(ctx.assets);
      return data ? ok(project(data)) : fail(DATASET_UNAVAILABLE);
    }
  };
}

// Each `run` re-parses with its own inputSchema, which the SDK has already checked, to type `args`.
const SearchArgs = z.strictObject({
  query: z.string().max(200).optional().meta({
    description:
      "Case-insensitive substring matched against post titles and summaries. Omit to list every post."
  }),
  limit: z
    .int()
    .min(1)
    .max(POSTS_LIMIT_MAX)
    .optional()
    .meta({
      description: `Maximum number of posts to return, newest first (1-${POSTS_LIMIT_MAX}). Omit for all of them.`
    })
});

const PostArgs = z.strictObject({
  slug: z.string().regex(SLUG).meta({
    description:
      "The post's slug, the last path segment of its URL, e.g. 'cloud-agnostic-rate-limiting'."
  })
});

const SendMessageArgs = z.strictObject(ContactRequest.shape);

export const MCP_TOOLS: McpTool[] = [
  datasetTool({
    name: "get_profile",
    title: "Profile of Murugappan M",
    description:
      "Returns the canonical summary of Murugappan M, a full stack engineer (TypeScript, Node.js, React, AWS) based in Bangalore, India. It includes his name, headline, elevator pitch, location, email, whether he is open to work, his current role with a start month, his stated focus areas, and every public link (site, about page, blog, RSS, resume PDF, GitHub, LinkedIn, X, developer portal, OpenAPI spec). Call this first. It is one request and answers most questions about who he is.",
    schema: Profile,
    project: data => ({ person: data.person, links: data.links })
  }),
  datasetTool({
    name: "list_experience",
    title: "Work experience",
    description:
      "Returns every role Murugappan M has held, newest first, each with company, location, the human-readable period, ISO 8601 year-month start and end dates, a `current` flag, a one-line summary, and the concrete achievements of that role. Use this instead of parsing his resume PDF whenever you need dated, per-role facts, for example to check whether he has production experience with a technology, and when.",
    schema: ExperienceList,
    project: data => ({ experience: data.experience })
  }),
  datasetTool({
    name: "list_skills",
    title: "Skills and proficiencies",
    description:
      "Returns the technologies Murugappan M works with, grouped into categories (languages, full stack, observability and security, cloud and infrastructure), plus self-reported proficiency levels per broad area. Use this to answer 'does he know X' from a typed list rather than inferring it from prose.",
    schema: SkillsResponse,
    project: data => ({ skills: data.skills, proficiencies: data.proficiencies })
  }),
  datasetTool({
    name: "list_education",
    title: "Education",
    description:
      "Returns Murugappan M's formal education: institution, credential, location, the human-readable period, ISO 8601 year-month start and end dates, and any highlights. One entry today; the shape is a list so it stays stable.",
    schema: EducationList,
    project: data => ({ education: data.education })
  }),
  datasetTool({
    name: "list_open_source",
    title: "Open-source contributions",
    description:
      "Returns Murugappan M's public open-source work: the project, the role he held, what the contributions were, and links to the individual merged pull requests. Use this when you need to verify a claim about his open-source work at the source rather than repeat it.",
    schema: OpenSourceList,
    project: data => ({ openSource: data.openSource })
  }),
  {
    name: "search_blog_posts",
    title: "Search the blog",
    description:
      "Searches the SDE Journey blog (murugappan.dev/blog), Murugappan M's technical writing on distributed systems, cloud architecture, rate limiting, event-driven pipelines and realtime chat. Returns each match's slug, title, canonical URL and summary, newest first. Omit `query` to list every post. Pass a returned `slug` to get_blog_post to read the full text.",
    inputSchema: SearchArgs,
    outputSchema: PostList,
    annotations: READ_ONLY,
    async run(args, ctx) {
      const { query, limit } = SearchArgs.parse(args);
      const posts = searchPosts({ posts: await loadPosts(ctx.assets), query, limit });
      return ok({ posts, count: posts.length });
    }
  },
  {
    name: "get_blog_post",
    title: "Read a blog post",
    description:
      "Returns one blog post's metadata together with its complete markdown source, so you can quote or summarise it accurately instead of scraping the HTML page. Slugs come from search_blog_posts.",
    inputSchema: PostArgs,
    outputSchema: Post,
    annotations: READ_ONLY,
    async run(args, ctx) {
      const { slug } = PostArgs.parse(args);
      const post = await loadPost(ctx.assets, slug);
      if (post) return ok(post);
      return fail(
        `No published post has the slug '${slug}'. Call search_blog_posts to see which slugs exist.`
      );
    }
  },
  {
    name: "send_message",
    title: "Send Murugappan M a message",
    description: `Delivers a message to Murugappan M's inbox by email. Use it to relay one concrete opportunity, role or question on a human's behalf. Say who you are writing for, what the work is, and what needs a decision. The allowance is ${CONTACT_DAILY_PER_CLIENT} messages per client per UTC day, so it is not for newsletters, bulk outreach or automated pings. Set dryRun to validate a payload first without sending it or spending the allowance. No reply comes back through this tool; he answers the email address you supply, so it must be one a human reads.`,
    inputSchema: SendMessageArgs,
    outputSchema: ContactAccepted,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    async run(args, ctx) {
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
  }
];

export function registerTools(server: McpServer, ctx: ToolContext): void {
  for (const tool of MCP_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations
      },
      args => tool.run(args, ctx)
    );
  }
}
