// api-spec.test.ts checks this document against the router.

import { z } from "zod";

import { API_BASE, API_PATHS, CURRENT_API_VERSION, VERSIONED_API_BASE } from "./routes";
import {
  CONTACT_DAILY_GLOBAL,
  CONTACT_DAILY_PER_CLIENT,
  ContactAccepted,
  ContactRequest
} from "./contact";
import {
  CurrentRole,
  EducationEntry,
  EducationList,
  ExperienceEntry,
  ExperienceList,
  Link,
  OpenSourceContribution,
  OpenSourceList,
  Person,
  Proficiency,
  Profile,
  SkillCategory,
  SkillsResponse
} from "./dataset";
import { ErrorBody, FieldIssue } from "./errors";
import { Post, PostList, PostsQuery, PostSummary, SLUG_PATTERN } from "./posts";
import { CONTACT_POLICY, READ_POLICY, READ_QUOTA } from "./quotas";
import {
  API_VERSION,
  ApiVersionPolicy,
  ApiVersionRecord,
  ApiVersions,
  DEPRECATION_NOTICE_DAYS,
  UnversionedAlias,
  VERSIONS
} from "./versioning";

type SchemaObject = {
  $ref?: string;
  type?: string | string[];
  description?: string;
  properties?: Record<string, SchemaObject>;
  [keyword: string]: unknown;
};

type Operation = {
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  parameters?: Array<{
    name: string;
    in: string;
    description: string;
    required?: boolean;
    schema: z.core.JSONSchema.BaseSchema;
  }>;
  requestBody?: unknown;
  responses: Record<
    string,
    { description: string; content?: Record<string, { schema: SchemaObject }> }
  >;
};

export type OpenApiDocument = {
  openapi: string;
  info: {
    title: string;
    version: string;
    summary: string;
    description: string;
    contact: { name: string; url: string; email: string };
    license: { name: string; identifier: string };
  };
  servers: Array<{ url: string; description: string }>;
  externalDocs: { url: string; description: string };
  tags: Array<{ name: string; description: string }>;
  security: unknown[];
  paths: Record<string, Partial<Record<"get" | "post", Operation>>>;
  components: {
    schemas: Record<string, z.core.JSONSchema.BaseSchema>;
    securitySchemes: Record<string, unknown>;
  };
};

const DESCRIPTION = `Read-only JSON access to everything murugappan.dev publishes about Murugappan M: profile, work experience, skills, education, open-source work and blog posts. One write endpoint, \`POST ${API_PATHS.contact}\`, passes along an opportunity.

**When to use this API.** Use it when you need grounded, first-party facts about Murugappan M as a candidate or collaborator: what he has shipped, which technologies he has production experience with, when he held which role, or what he has written about a technical topic. \`GET ${API_PATHS.profile}\` is the cheapest single call for "who is this person"; \`GET ${API_PATHS.post}\` returns a post's full markdown when you need to cite or summarise his writing. Use \`POST ${API_PATHS.contact}\` only to relay a real, specific opportunity or question on a human's behalf.

**When not to use it.** It is not a general-purpose search, resume-parsing or job-matching service, and it holds data about exactly one person.

**Authentication.** None. Every endpoint is public and unauthenticated; no key, token or signup is required. Read endpoints are cached for 5 minutes.

**Versioning.** The version is a path segment, \`${VERSIONED_API_BASE}/…\`. The unversioned \`${API_BASE}/…\` prefix is a permanent alias for \`${CURRENT_API_VERSION}\` and is never repointed at a later major version, so either form is safe to hard-code. Additive changes ship inside a version without notice, so ignore response fields you do not recognise. Breaking changes only ever ship as a new path version. Every response carries \`API-Version\` and \`API-Supported-Versions\`; \`GET ${API_PATHS.versions}\` is the machine-readable policy.

**Deprecation.** A deprecated version answers every request with \`Deprecation\` (RFC 9745) and \`Sunset\` (RFC 8594) headers plus \`Link\` relations \`deprecation\` and \`successor-version\`, and at least ${DEPRECATION_NOTICE_DAYS} days pass between the first \`Deprecation\` header and the sunset date. After sunset the version answers \`410\`. Nothing is currently deprecated: ${VERSIONS.map(v => `\`${v.version}\` is ${v.status}`).join(", ")}.

**Rate limits.** Every response carries \`RateLimit-Policy\` and \`RateLimit\` (draft-ietf-httpapi-ratelimit-headers), mirrored as \`X-RateLimit-Limit\`, \`X-RateLimit-Remaining\` and \`X-RateLimit-Reset\`, and a \`429\` adds \`Retry-After\`. Reads have a fair-use ceiling of ${READ_QUOTA.quota} requests per ${READ_QUOTA.windowSeconds} seconds per client, counted in the edge location that serves you. The read policy is published as \`${READ_POLICY}\`. \`POST ${API_PATHS.contact}\` is metered at ${CONTACT_DAILY_PER_CLIENT} per client IP per UTC day and ${CONTACT_DAILY_GLOBAL} site-wide, published as \`${CONTACT_POLICY}\`.

**Errors.** Every failure, including a 404 on an unknown \`${API_BASE}/*\` path, returns the \`Error\` schema below: a stable \`code\`, a human \`message\`, a \`hint\` describing the fix, and \`documentation_url\`. Nothing under \`${API_BASE}\` serves an HTML error page. Off the API, a request for a path that does not exist gets a real \`404\` whose body is short markdown pointing at the sitemap and these entry points, so an agent can recover without parsing a styled page.

**MCP.** The same content is served as a Model Context Protocol server (Streamable HTTP) at \`POST /mcp\`, protocol revision 2026-07-28 with backward compatibility for the \`initialize\`-based revisions. Eight tools (\`get_profile\`, \`list_experience\`, \`list_skills\`, \`list_education\`, \`list_open_source\`, \`search_blog_posts\`, \`get_blog_post\`, \`send_message\`) plus resources for the site's documents and every blog post. Add it to an MCP client as \`https://murugappan.dev/mcp\`. No auth is needed. Its manifest (\`server.json\`) is at \`https://murugappan.dev/.well-known/mcp.json\`.

**Conversation.** The site also runs an AI assistant ("Jarvis") in the chat widget on every page. Its WebSocket is private to the widget and has no published protocol, so programs should use this API or the MCP server.

**Other machine-readable entry points.** \`/.well-known/api-catalog\` (RFC 9727 linkset of every API here), \`/.well-known/mcp.json\` (MCP server manifest), \`/mcp\` (MCP server), \`/llms.txt\` (site summary + every blog post), \`/AGENTS.md\` (agent instructions), \`/blog/llms-full.txt\` (full post text), \`/sitemap.xml\`, and \`index.md\` under the path of the home, about and blog pages and every post (markdown, such as \`/about/index.md\`).`;

const jsonResponse = (description: string, ref: string) => ({
  description,
  content: { "application/json": { schema: { $ref: ref } } }
});

const errorResponse = (description: string) =>
  jsonResponse(description, "#/components/schemas/Error");

const rateLimited = errorResponse(
  "The client's read allowance for the current window is spent (`rate_limited`). `Retry-After` and the `RateLimit` header say when to come back. See the Rate limits section above."
);

const readFailures = {
  "429": rateLimited,
  "500": errorResponse("Unexpected server error.")
};

// Schemas as the API emits them, each a named component; nesting becomes a `$ref`.
const OUTPUT_SCHEMAS = {
  Error: ErrorBody,
  FieldIssue,
  Link,
  CurrentRole,
  Person,
  Profile,
  ExperienceEntry,
  ExperienceList,
  SkillCategory,
  Proficiency,
  SkillsResponse,
  EducationEntry,
  EducationList,
  OpenSourceContribution,
  OpenSourceList,
  PostSummary,
  PostList,
  Post,
  ApiVersionRecord,
  ApiVersionPolicy,
  UnversionedAlias,
  ApiVersions,
  ContactAccepted
};

function components(schemas: Record<string, z.ZodType>, io: "input" | "output") {
  const registry = z.registry<{ id: string }>();
  for (const [id, schema] of Object.entries(schemas)) registry.add(schema, { id });
  const generated = z.toJSONSchema(registry, { io, uri: id => `#/components/schemas/${id}` });
  // A component is a fragment of the OpenAPI document, not a standalone JSON Schema document.
  for (const schema of Object.values(generated.schemas)) {
    delete schema.$schema;
    delete schema.$id;
  }
  return generated.schemas;
}

// From the schema the handler parses with, so the documented limits are the enforced ones. Output
// types, since a parameter documents the parsed value (`limit` an integer, not its query text).
function queryParameters(query: z.ZodObject) {
  const { properties = {}, required = [] } = z.toJSONSchema(query, { io: "output" });
  return Object.entries(properties).map(([name, property]) => {
    if (typeof property === "boolean") throw new Error(`query parameter ${name}: boolean schema`);
    const { description = "", ...schema } = property;
    return { name, in: "query", required: required.includes(name), description, schema };
  });
}

// Requests are described as clients send them, before ContactRequest's trimming and defaults.
const COMPONENT_SCHEMAS = {
  ...components(OUTPUT_SCHEMAS, "output"),
  ...components({ ContactRequest }, "input")
};

/** Everything but `servers`, which apps/api/src/api/openapi.ts adds per request. */
export const OPENAPI_DOCUMENT: Omit<OpenApiDocument, "servers"> = {
  openapi: "3.1.0",
  info: {
    title: "murugappan.dev API",
    version: API_VERSION,
    summary: "Structured facts about Murugappan M, full stack engineer, for agents and developers.",
    description: DESCRIPTION,
    contact: {
      name: "Murugappan M",
      url: "https://murugappan.dev/developers/",
      email: "murugu2001@gmail.com"
    },
    license: { name: "CC BY 4.0", identifier: "CC-BY-4.0" }
  },
  externalDocs: {
    url: "https://murugappan.dev/developers/",
    description: "Developer portal: quickstart, examples and agent notes."
  },
  tags: [
    {
      name: "profile",
      description: "Who Murugappan M is: pitch, current role, links and focus areas."
    },
    {
      name: "resume",
      description:
        "Career history: work experience, skills and education, the same data the resume PDF is rendered from."
    },
    {
      name: "content",
      description: "Blog posts published at murugappan.dev/blog."
    },
    {
      name: "contact",
      description: "Reaching Murugappan M about an opportunity."
    },
    {
      name: "meta",
      description: "The API's own machine-readable description."
    }
  ],
  security: [],
  paths: {
    [API_PATHS.profile]: {
      get: {
        operationId: "getProfile",
        summary: "Get the full profile",
        description:
          "Returns the canonical summary of Murugappan M: name, headline, elevator pitch, location, email, whether he is open to work, his current role with a start month, his stated focus areas, and every public link (site, about page, blog, RSS, resume PDF, GitHub, LinkedIn, X, developer portal, OpenAPI spec). This is the single cheapest call for grounding an answer about him.",
        tags: ["profile"],
        responses: {
          "200": jsonResponse("The profile and its links.", "#/components/schemas/Profile"),
          ...readFailures
        }
      }
    },
    [API_PATHS.experience]: {
      get: {
        operationId: "listExperience",
        summary: "List work experience",
        description:
          "Returns every role Murugappan M has held, newest first, each with company, location, the human-readable period, ISO 8601 year-month start and end dates, a `current` flag, a one-line summary and the achievement highlights. Use this rather than parsing the resume PDF when you need dated, per-role facts.",
        tags: ["resume"],
        responses: {
          "200": jsonResponse("Work history, newest first.", "#/components/schemas/ExperienceList"),
          ...readFailures
        }
      }
    },
    [API_PATHS.skills]: {
      get: {
        operationId: "listSkills",
        summary: "List skills and proficiencies",
        description:
          "Returns the technologies Murugappan M works with, grouped into categories (languages, full stack, observability and security, cloud and infrastructure), plus self-reported proficiency levels per broad area. Use this to answer 'does he know X' without inferring it from prose.",
        tags: ["resume"],
        responses: {
          "200": jsonResponse(
            "Skill categories and proficiency levels.",
            "#/components/schemas/SkillsResponse"
          ),
          ...readFailures
        }
      }
    },
    [API_PATHS.education]: {
      get: {
        operationId: "listEducation",
        summary: "List education",
        description:
          "Returns formal education: institution, credential, location, the human-readable period, ISO 8601 year-month start and end dates, and any highlights. One entry today; the shape is a list so it stays stable.",
        tags: ["resume"],
        responses: {
          "200": jsonResponse("Education history.", "#/components/schemas/EducationList"),
          ...readFailures
        }
      }
    },
    [API_PATHS.openSource]: {
      get: {
        operationId: "listOpenSourceContributions",
        summary: "List open-source contributions",
        description:
          "Returns Murugappan M's public open-source work: the project, the role he held, what the contributions were, and links to the individual merged pull requests so a claim can be verified at the source.",
        tags: ["profile"],
        responses: {
          "200": jsonResponse(
            "Open-source contributions with verifiable links.",
            "#/components/schemas/OpenSourceList"
          ),
          ...readFailures
        }
      }
    },
    [API_PATHS.posts]: {
      get: {
        operationId: "listBlogPosts",
        summary: "List blog posts",
        description:
          "Returns every post on the SDE Journey blog, newest first, with its slug, title, canonical URL and summary. Pass the returned `slug` to `getBlogPost` to read a post's full markdown. Optionally narrow the list with a case-insensitive substring query.",
        tags: ["content"],
        parameters: queryParameters(PostsQuery),
        responses: {
          "200": jsonResponse("Matching posts, newest first.", "#/components/schemas/PostList"),
          "400": errorResponse("A query parameter broke its documented type, range or length."),
          ...readFailures
        }
      }
    },
    [API_PATHS.post]: {
      get: {
        operationId: "getBlogPost",
        summary: "Get one blog post with its full markdown",
        description:
          "Returns a single post's metadata together with its complete markdown source (frontmatter included), so an agent can quote or summarise it without scraping HTML. Slugs come from `listBlogPosts`.",
        tags: ["content"],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            description:
              "The post's slug, the last path segment of its URL, e.g. `cloud-agnostic-rate-limiting`.",
            schema: { type: "string", pattern: SLUG_PATTERN }
          }
        ],
        responses: {
          "200": jsonResponse("The post and its markdown source.", "#/components/schemas/Post"),
          "404": errorResponse(
            "No post exists with that slug. Call listBlogPosts for the current set."
          ),
          ...readFailures
        }
      }
    },
    [API_PATHS.contact]: {
      post: {
        operationId: "sendContactMessage",
        summary: "Send Murugappan M a message",
        description: `Delivers a message to Murugappan M's inbox by email and answers 202 once it is accepted. Send \`"dryRun": true\` first to validate a payload without sending it. That is this endpoint's sandbox, and it spends no allowance. Use it to relay a concrete opportunity, role or question on a human's behalf, and include who you are writing for and how to reply. The endpoint allows ${CONTACT_DAILY_PER_CLIENT} requests per client IP per UTC day and ${CONTACT_DAILY_GLOBAL} site-wide, so it is not for newsletters, bulk outreach or automated pings. No reply comes back over the API; Murugappan answers the address you supply.`,
        tags: ["contact"],
        requestBody: {
          required: true,
          description: "Who is writing, and what about.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ContactRequest" }
            }
          }
        },
        responses: {
          "200": jsonResponse(
            "A dry run: the request is valid and nothing was sent.",
            "#/components/schemas/ContactAccepted"
          ),
          "202": jsonResponse(
            "The message was accepted for delivery.",
            "#/components/schemas/ContactAccepted"
          ),
          "400": errorResponse("The request body was not valid JSON."),
          "413": errorResponse("The request body exceeded the size limit."),
          "415": errorResponse("The Content-Type was not application/json."),
          "422": errorResponse("One or more fields were invalid; `details` names each one."),
          "429": errorResponse(
            "The per-client or site-wide daily allowance is spent. Retry after 00:00 UTC."
          ),
          "500": errorResponse("Unexpected server error."),
          "503": errorResponse("Email delivery is not configured or is temporarily unavailable.")
        }
      }
    },
    [API_PATHS.versions]: {
      get: {
        operationId: "getApiVersions",
        summary: "Get the version and deprecation policy",
        description:
          "Returns every version of this API, its status, the release it serves and its sunset date if it has one, together with the policy in force: how versions are selected, what may change inside one, and which headers announce a deprecation. Read this before hard-coding a base path. It is the machine-readable form of the promise the API makes about not changing under you. Also reachable unversioned at `/api/versions`.",
        tags: ["meta"],
        responses: {
          "200": jsonResponse(
            "The version catalogue and the policy governing it.",
            "#/components/schemas/ApiVersions"
          ),
          ...readFailures
        }
      }
    },
    [API_PATHS.openapi]: {
      get: {
        operationId: "getOpenApiSpec",
        summary: "Get this OpenAPI document",
        description:
          "Returns this OpenAPI 3.1.0 document. The canonical location is `/openapi.json` at the site root; this path is the same document served under the API prefix for clients that look there first.",
        tags: ["meta"],
        responses: {
          "200": {
            description: "The OpenAPI 3.1.0 description of this API.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  description: "An OpenAPI 3.1.0 document.",
                  additionalProperties: true
                }
              }
            }
          },
          ...readFailures
        }
      }
    }
  },
  components: {
    securitySchemes: {},
    schemas: COMPONENT_SCHEMAS
  }
};
