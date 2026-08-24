// The MCP tool surface. Every tool is a thin adapter over the same loaders the
// REST API uses (worker/api/store.ts), and its outputSchema is the API's own
// response schema inlined into a self-contained document — so /mcp, /api/* and
// the OpenAPI spec describe one implementation rather than three.
//
// Error convention follows the spec's two mechanisms: "unknown tool" and
// malformed requests are protocol errors raised by the dispatcher, while
// everything a model could plausibly fix by retrying with different arguments
// — bad slug, out-of-range limit, invalid email, spent allowance — comes back
// as a tool execution error (`isError: true`) with text that says what to do.

import {API_SCHEMAS} from "../api/openapi";
import {parseContactRequest, CONTACT_DAILY_PER_CLIENT} from "../api/contact";
import {
  loadDataset,
  loadPostMarkdown,
  loadPosts,
  type AssetsLike
} from "../api/store";
import {sendContactEmail, type EmailLike} from "../email";
import {resolveSchema, type JsonSchema} from "./schema";

export type ToolContext = {
  assets: AssetsLike;
  env: Env;
  /** Caller IP, used for the send_message allowance. */
  clientIp: string;
};

export type ToolTextContent = {type: "text"; text: string};

export type ToolResult = {
  content: ToolTextContent[];
  structuredContent?: unknown;
  isError?: boolean;
};

export type ToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

export type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  annotations: ToolAnnotations;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
};

const POSTS_LIMIT_MAX = 100;

const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

const NO_ARGS: JsonSchema = {
  type: "object",
  properties: {},
  additionalProperties: false
};

const out = (name: string) => resolveSchema(name, API_SCHEMAS);

/** Success: structured data plus the serialized JSON the spec asks for. */
function ok(data: unknown): ToolResult {
  return {
    content: [{type: "text", text: JSON.stringify(data, null, 2)}],
    structuredContent: data
  };
}

/** A failure the calling model can act on. */
function fail(text: string): ToolResult {
  return {content: [{type: "text", text}], isError: true};
}

const DATASET_UNAVAILABLE =
  "The site's content dataset is not available right now — this is a transient deployment state. Retry in a minute, or read https://murugappan.dev/llms.txt instead.";

// Shared body of the five dataset-backed read tools.
function datasetTool(
  name: string,
  title: string,
  description: string,
  schema: string,
  project: (
    data: NonNullable<Awaited<ReturnType<typeof loadDataset>>>
  ) => unknown
): McpTool {
  return {
    name,
    title,
    description,
    inputSchema: NO_ARGS,
    outputSchema: out(schema),
    annotations: READ_ONLY,
    async run(_args, ctx) {
      const data = await loadDataset(ctx.assets);
      return data ? ok(project(data)) : fail(DATASET_UNAVAILABLE);
    }
  };
}

function optionalString(
  args: Record<string, unknown>,
  field: string
): {value?: string; error?: string} {
  const raw = args[field];
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "string")
    return {error: `The '${field}' argument must be a string.`};
  return {value: raw};
}

export const MCP_TOOLS: McpTool[] = [
  datasetTool(
    "get_profile",
    "Profile of Murugappan M",
    "Returns the canonical summary of Murugappan M — a full stack engineer (TypeScript, Node.js, React, AWS) based in Bangalore, India: name, headline, elevator pitch, location, email, whether he is open to work, his current role with a start month, his stated focus areas, and every public link (site, about page, blog, RSS, resume PDF, GitHub, LinkedIn, X, developer portal, OpenAPI spec). Call this first — it is one request and answers most questions about who he is.",
    "Profile",
    data => ({person: data.person, links: data.links})
  ),
  datasetTool(
    "list_experience",
    "Work experience",
    "Returns every role Murugappan M has held, newest first, each with company, location, the human-readable period, ISO 8601 year-month start and end dates, a `current` flag, a one-line summary, and the concrete achievements of that role. Use this instead of parsing his resume PDF whenever you need dated, per-role facts — for example to check whether he has production experience with a technology, and when.",
    "ExperienceList",
    data => ({experience: data.experience})
  ),
  datasetTool(
    "list_skills",
    "Skills and proficiencies",
    "Returns the technologies Murugappan M works with, grouped into categories (languages, full stack, observability and security, cloud and infrastructure), plus self-reported proficiency levels per broad area. Use this to answer 'does he know X' from a typed list rather than inferring it from prose.",
    "SkillsResponse",
    data => ({skills: data.skills, proficiencies: data.proficiencies})
  ),
  datasetTool(
    "list_education",
    "Education",
    "Returns Murugappan M's formal education: institution, credential, location, the human-readable period, ISO 8601 year-month start and end dates, and any highlights. One entry today; the shape is a list so it stays stable.",
    "EducationList",
    data => ({education: data.education})
  ),
  datasetTool(
    "list_open_source",
    "Open-source contributions",
    "Returns Murugappan M's public open-source work: the project, the role he held, what the contributions were, and links to the individual merged pull requests. Use this when you need to verify a claim about his open-source work at the source rather than repeat it.",
    "OpenSourceList",
    data => ({openSource: data.openSource})
  ),
  {
    name: "search_blog_posts",
    title: "Search the blog",
    description:
      "Searches the SDE Journey blog (murugappan.dev/blog) — Murugappan M's technical writing on distributed systems, cloud architecture, rate limiting, event-driven pipelines and realtime chat. Returns each match's slug, title, canonical URL and summary, newest first. Omit `query` to list every post. Pass a returned `slug` to get_blog_post to read the full text.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Case-insensitive substring matched against post titles and summaries. Omit to list every post.",
          maxLength: 200
        },
        limit: {
          type: "integer",
          description: `Maximum number of posts to return, newest first (1-${POSTS_LIMIT_MAX}). Omit for all of them.`,
          minimum: 1,
          maximum: POSTS_LIMIT_MAX
        }
      },
      additionalProperties: false
    },
    outputSchema: out("PostList"),
    annotations: READ_ONLY,
    async run(args, ctx) {
      const query = optionalString(args, "query");
      if (query.error) return fail(query.error);

      let limit: number | undefined;
      if (args.limit !== undefined && args.limit !== null) {
        const parsed = Number(args.limit);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > POSTS_LIMIT_MAX)
          return fail(
            `The 'limit' argument must be an integer between 1 and ${POSTS_LIMIT_MAX}, or omitted.`
          );
        limit = parsed;
      }

      let posts = await loadPosts(ctx.assets);
      const needle = query.value?.trim().toLowerCase();
      if (needle) {
        posts = posts.filter(
          p =>
            p.title.toLowerCase().includes(needle) ||
            p.description.toLowerCase().includes(needle)
        );
      }
      if (limit !== undefined) posts = posts.slice(0, limit);
      return ok({posts, count: posts.length});
    }
  },
  {
    name: "get_blog_post",
    title: "Read a blog post",
    description:
      "Returns one blog post's metadata together with its complete markdown source, so you can quote or summarise it accurately instead of scraping the HTML page. Slugs come from search_blog_posts.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description:
            "The post's slug — the last path segment of its URL, e.g. 'cloud-agnostic-rate-limiting'.",
          pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"
        }
      },
      required: ["slug"],
      additionalProperties: false
    },
    outputSchema: out("Post"),
    annotations: READ_ONLY,
    async run(args, ctx) {
      const slug = optionalString(args, "slug");
      if (slug.error) return fail(slug.error);
      if (!slug.value)
        return fail(
          "The 'slug' argument is required. Call search_blog_posts to discover slugs."
        );

      const notFound = `No published post has the slug '${slug.value}'. Call search_blog_posts to see which slugs exist.`;
      const post = (await loadPosts(ctx.assets)).find(
        p => p.slug === slug.value
      );
      if (!post) return fail(notFound);
      const markdown = await loadPostMarkdown(ctx.assets, slug.value);
      if (markdown === null) return fail(notFound);
      return ok({...post, markdown});
    }
  },
  {
    name: "send_message",
    title: "Send Murugappan M a message",
    description: `Delivers a message to Murugappan M's inbox by email. Use it to relay one concrete opportunity, role or question on a human's behalf — say who you are writing for, what the work is, and what needs a decision. Not for newsletters, bulk outreach or automated pings: the allowance is ${CONTACT_DAILY_PER_CLIENT} messages per client per UTC day. Set dryRun to validate a payload first without sending it or spending the allowance. No reply comes back through this tool; he answers the email address you supply, so it must be one a human reads.`,
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description:
            "Reply-to address. This is where Murugappan replies, so it must be an address the sender actually reads.",
          format: "email"
        },
        message: {
          type: "string",
          description:
            "What you are writing about. Be specific: the role or project, the stack, and anything that needs a decision.",
          minLength: 20,
          maxLength: 4000
        },
        name: {
          type: "string",
          description: "Who the message is from.",
          maxLength: 120
        },
        company: {
          type: "string",
          description: "The company or team you are writing on behalf of.",
          maxLength: 120
        },
        dryRun: {
          type: "boolean",
          description:
            "Validate the payload and return without sending anything or spending the allowance. Use this to check a message before committing to it.",
          default: false
        }
      },
      required: ["email", "message"],
      additionalProperties: false
    },
    outputSchema: out("ContactAccepted"),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      // Sends email to a third party outside this server.
      openWorldHint: true
    },
    async run(args, ctx) {
      const parsed = parseContactRequest(args);
      if (!parsed.ok) {
        const issues = parsed.issues
          .map(i => `- ${i.field}: ${i.issue}`)
          .join("\n");
        return fail(
          `The message was not sent because these arguments are invalid:\n${issues}\nFix them and call send_message again.`
        );
      }

      if (parsed.dryRun) {
        return ok({
          status: "validated",
          message:
            "The request is valid. Call again without dryRun to deliver it."
        });
      }

      const inbox = ctx.env.OPPORTUNITY_INBOX?.trim();
      const email = ctx.env.EMAIL as unknown as EmailLike | undefined;
      if (!inbox || !email)
        return fail(
          "Message delivery is not configured on this deployment. Use one of the contact links from get_profile instead."
        );

      const limiter = ctx.env.RateLimiter.get(
        ctx.env.RateLimiter.idFromName("global")
      );
      const slot = await limiter.takeContactSlot(ctx.clientIp);
      if (!slot.allowed)
        return fail(
          slot.scope === "client"
            ? `This client has already used its daily allowance of ${CONTACT_DAILY_PER_CLIENT} messages. It resets at 00:00 UTC — until then, use one of the contact links from get_profile.`
            : "The site-wide daily message allowance is spent. It resets at 00:00 UTC — until then, use one of the contact links from get_profile."
        );

      try {
        await sendContactEmail(email, inbox, parsed.value);
      } catch (err) {
        console.error("mcp send_message failed", err);
        return fail(
          "The message could not be delivered right now. Retry in a few minutes, or use one of the contact links from get_profile."
        );
      }
      return ok({
        status: "accepted",
        message:
          "Message accepted — Murugappan will reply to the address you gave."
      });
    }
  }
];

const BY_NAME = new Map(MCP_TOOLS.map(tool => [tool.name, tool]));

/** Exact, case-sensitive lookup, as the spec specifies for tool names. */
export function findTool(name: string): McpTool | undefined {
  return BY_NAME.get(name);
}
