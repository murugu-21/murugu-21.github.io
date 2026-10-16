import { z } from "zod";

import type { JsonRecord } from "@murugappan/utils/json.ts";
import { CONTACT_DAILY_PER_CLIENT, ContactAccepted, ContactRequest } from "./api/contact";
import {
  EducationList,
  ExperienceList,
  OpenSourceList,
  Profile,
  SkillsResponse
} from "./api/dataset";
import { Post, PostList, POSTS_LIMIT_MAX, PostsLimit, PostsSearchText, SLUG } from "./api/posts";
import type { DocumentKey } from "./surface";

export const LATEST_PROTOCOL_VERSION = "2026-07-28";
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

/** Whether a tool only reads, or changes something outside the server. */
export type ToolKind = "read" | "write";

type ToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

export const TOOL_ANNOTATIONS: Record<ToolKind, ToolAnnotations> = {
  read: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  write: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
};

export type McpToolDescriptor = {
  name: string;
  kind: ToolKind;
  title: string;
  guideSummary: string;
  description: string;
  inputSchema: z.ZodObject;
  outputSchema: z.ZodObject & z.ZodType<JsonRecord>;
};

const NO_ARGS = z.strictObject({});

function datasetTool<const Name extends string>({
  name,
  title,
  guideSummary,
  description,
  schema
}: {
  name: Name;
  title: string;
  guideSummary: string;
  description: string;
  schema: McpToolDescriptor["outputSchema"];
}): McpToolDescriptor & { name: Name } {
  return {
    name,
    kind: "read",
    title,
    guideSummary,
    description,
    inputSchema: NO_ARGS,
    outputSchema: schema
  };
}

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
    guideSummary: "Who he is: pitch, current role, location, links. Call this first.",
    description:
      "Returns the canonical summary of Murugappan M, a full stack engineer (TypeScript, Node.js, React, AWS) based in Bangalore, India. It includes his name, headline, elevator pitch, location, email, whether he is open to work, his current role with a start month, his stated focus areas, and every public link (site, about page, blog, RSS, resume PDF, GitHub, LinkedIn, X, developer portal, OpenAPI spec). Call this first. It is one request and answers most questions about who he is.",
    schema: Profile
  }),
  datasetTool({
    name: "list_experience",
    title: "Work experience",
    guideSummary: "Dated roles with per-role achievements",
    description:
      "Returns every role Murugappan M has held, newest first, each with company, location, the human-readable period, ISO 8601 year-month start and end dates, a `current` flag, a one-line summary, and the concrete achievements of that role. Use this instead of parsing his resume PDF whenever you need dated, per-role facts, for example to check whether he has production experience with a technology, and when.",
    schema: ExperienceList
  }),
  datasetTool({
    name: "list_skills",
    title: "Skills and proficiencies",
    guideSummary: "Typed skill categories and proficiencies",
    description:
      "Returns the technologies Murugappan M works with, grouped into categories (languages, full stack, observability and security, cloud and infrastructure), plus self-reported proficiency levels per broad area. Use this to answer 'does he know X' from a typed list rather than inferring it from prose.",
    schema: SkillsResponse
  }),
  datasetTool({
    name: "list_education",
    title: "Education",
    guideSummary: "Degrees",
    description:
      "Returns Murugappan M's formal education: institution, credential, location, the human-readable period, ISO 8601 year-month start and end dates, and any highlights. One entry today; the shape is a list so it stays stable.",
    schema: EducationList
  }),
  datasetTool({
    name: "list_open_source",
    title: "Open-source contributions",
    guideSummary: "Contributions with links to the merged PRs",
    description:
      "Returns Murugappan M's public open-source work: the project, the role he held, what the contributions were, and links to the individual merged pull requests. Use this when you need to verify a claim about his open-source work at the source rather than repeat it.",
    schema: OpenSourceList
  }),
  {
    name: "search_blog_posts",
    kind: "read",
    title: "Search the blog",
    guideSummary: "Search titles and summaries (`query`, `limit`)",
    description:
      "Searches the SDE Journey blog (murugappan.dev/blog), Murugappan M's technical writing on distributed systems, cloud architecture, rate limiting, event-driven pipelines and realtime chat. Returns each match's slug, title, canonical URL and summary, newest first. Omit `query` to list every post. Pass a returned `slug` to get_blog_post to read the full text.",
    inputSchema: SearchArgs,
    outputSchema: PostList
  },
  {
    name: "get_blog_post",
    kind: "read",
    title: "Read a blog post",
    guideSummary: "One post's full markdown (`slug`)",
    description:
      "Returns one blog post's metadata together with its complete markdown source, so you can quote or summarise it accurately instead of scraping the HTML page. Slugs come from search_blog_posts.",
    inputSchema: PostArgs,
    outputSchema: Post
  },
  {
    name: "send_message",
    kind: "write",
    title: "Send Murugappan M a message",
    guideSummary: "Email him (`email`, `message`, optional `dryRun`)",
    description: `Delivers a message to Murugappan M's inbox by email. Use it to relay one concrete opportunity, role or question on a human's behalf. Say who you are writing for, what the work is, and what needs a decision. The allowance is ${CONTACT_DAILY_PER_CLIENT} messages per client per UTC day, so it is not for newsletters, bulk outreach or automated pings. Set dryRun to validate a payload first without sending it or spending the allowance. No reply comes back through this tool; he answers the email address you supply, so it must be one a human reads.`,
    inputSchema: SendMessageArgs,
    outputSchema: ContactAccepted
  }
] as const satisfies readonly McpToolDescriptor[];

export type McpToolName = (typeof TOOLS)[number]["name"];

export const MCP_TOOLS: readonly (McpToolDescriptor & { name: McpToolName })[] = TOOLS;

/** The documents the server also serves as static resources, in list order. */
export const MCP_RESOURCES = [
  "llms",
  "agentGuide",
  "openapi",
  "llmsFull"
] as const satisfies readonly DocumentKey[];
export type McpResourceKey = (typeof MCP_RESOURCES)[number];
