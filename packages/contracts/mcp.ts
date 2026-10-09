// The MCP server's public surface: protocol versions, identity and tool catalogue. apps/api/src/mcp
// serves it, and /developers/ and the server.json manifest list it.

import { z } from "zod";

import { CONTACT_DAILY_PER_CLIENT, ContactAccepted, ContactRequest } from "./api/contact";
import {
  EducationList,
  ExperienceList,
  OpenSourceList,
  Profile,
  SkillsResponse
} from "./api/dataset";
import { Post, PostList, POSTS_LIMIT_MAX, PostsLimit, PostsSearchText, SLUG } from "./api/posts";

export const LATEST_PROTOCOL_VERSION = "2026-07-28";
// Newest first. `initialize` falls back to the first entry.
export const LEGACY_PROTOCOL_VERSIONS: readonly string[] = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26"
];
export const SUPPORTED_PROTOCOL_VERSIONS: string[] = [
  LATEST_PROTOCOL_VERSION,
  ...LEGACY_PROTOCOL_VERSIONS
];

export const SERVER_NAME = "murugappan.dev";

// The MCP registry requires a reverse-DNS namespace the publisher controls.
export const MCP_SERVER_NAME = "dev.murugappan/murugappan-dev";
export const MCP_SERVER_SCHEMA =
  "https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json";

type ToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

export type McpToolDescriptor = {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  annotations: ToolAnnotations;
};

const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

const NO_ARGS = z.strictObject({});

function datasetTool<const Name extends string>({
  name,
  title,
  description,
  schema
}: {
  name: Name;
  title: string;
  description: string;
  schema: z.ZodType;
}) {
  return {
    name,
    title,
    description,
    inputSchema: NO_ARGS,
    outputSchema: schema,
    annotations: READ_ONLY
  };
}

// The Worker re-parses each call with these, after the SDK has checked them, to type `args`.
export const SearchArgs = z.strictObject({
  query: PostsSearchText.optional().meta({
    description:
      "Case-insensitive substring matched against post titles and summaries. Omit to list every post."
  }),
  limit: PostsLimit.optional().meta({
    description: `Maximum number of posts to return, newest first (1-${POSTS_LIMIT_MAX}). Omit for all of them.`
  })
});

export const PostArgs = z.strictObject({
  slug: z.string().regex(SLUG).meta({
    description:
      "The post's slug, the last path segment of its URL, e.g. 'cloud-agnostic-rate-limiting'."
  })
});

// Strict, unlike REST: a misspelt argument should fail the call, not vanish.
export const SendMessageArgs = z.strictObject(ContactRequest.shape);

const TOOLS = [
  datasetTool({
    name: "get_profile",
    title: "Profile of Murugappan M",
    description:
      "Returns the canonical summary of Murugappan M, a full stack engineer (TypeScript, Node.js, React, AWS) based in Bangalore, India. It includes his name, headline, elevator pitch, location, email, whether he is open to work, his current role with a start month, his stated focus areas, and every public link (site, about page, blog, RSS, resume PDF, GitHub, LinkedIn, X, developer portal, OpenAPI spec). Call this first. It is one request and answers most questions about who he is.",
    schema: Profile
  }),
  datasetTool({
    name: "list_experience",
    title: "Work experience",
    description:
      "Returns every role Murugappan M has held, newest first, each with company, location, the human-readable period, ISO 8601 year-month start and end dates, a `current` flag, a one-line summary, and the concrete achievements of that role. Use this instead of parsing his resume PDF whenever you need dated, per-role facts, for example to check whether he has production experience with a technology, and when.",
    schema: ExperienceList
  }),
  datasetTool({
    name: "list_skills",
    title: "Skills and proficiencies",
    description:
      "Returns the technologies Murugappan M works with, grouped into categories (languages, full stack, observability and security, cloud and infrastructure), plus self-reported proficiency levels per broad area. Use this to answer 'does he know X' from a typed list rather than inferring it from prose.",
    schema: SkillsResponse
  }),
  datasetTool({
    name: "list_education",
    title: "Education",
    description:
      "Returns Murugappan M's formal education: institution, credential, location, the human-readable period, ISO 8601 year-month start and end dates, and any highlights. One entry today; the shape is a list so it stays stable.",
    schema: EducationList
  }),
  datasetTool({
    name: "list_open_source",
    title: "Open-source contributions",
    description:
      "Returns Murugappan M's public open-source work: the project, the role he held, what the contributions were, and links to the individual merged pull requests. Use this when you need to verify a claim about his open-source work at the source rather than repeat it.",
    schema: OpenSourceList
  }),
  {
    name: "search_blog_posts",
    title: "Search the blog",
    description:
      "Searches the SDE Journey blog (murugappan.dev/blog), Murugappan M's technical writing on distributed systems, cloud architecture, rate limiting, event-driven pipelines and realtime chat. Returns each match's slug, title, canonical URL and summary, newest first. Omit `query` to list every post. Pass a returned `slug` to get_blog_post to read the full text.",
    inputSchema: SearchArgs,
    outputSchema: PostList,
    annotations: READ_ONLY
  },
  {
    name: "get_blog_post",
    title: "Read a blog post",
    description:
      "Returns one blog post's metadata together with its complete markdown source, so you can quote or summarise it accurately instead of scraping the HTML page. Slugs come from search_blog_posts.",
    inputSchema: PostArgs,
    outputSchema: Post,
    annotations: READ_ONLY
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
    }
  }
] as const satisfies readonly McpToolDescriptor[];

export type McpToolName = (typeof TOOLS)[number]["name"];

export const MCP_TOOLS: readonly (McpToolDescriptor & { name: McpToolName })[] = TOOLS;
