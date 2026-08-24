// The published OpenAPI 3.1.0 description of this site's API, served at
// /openapi.json (canonical) and /api/openapi.json. It is generated rather
// than hand-maintained as a file so the origin in `servers` matches whatever
// host answered the request, and so api-openapi.test.ts can hold it to the
// contract the router actually implements (see api/routes.ts).
//
// Every operation carries a unique operationId, a description, typed
// parameters and a response schema — that is what makes the document usable
// as a function-calling tool definition without hand-editing.

import {API_PATHS} from "./routes";
import {
  CONTACT_DAILY_GLOBAL,
  CONTACT_DAILY_PER_CLIENT,
  CONTACT_LIMITS
} from "./contact";

export const API_VERSION = "1.0.0";

export type OpenApiDocument = {
  openapi: string;
  info: {
    title: string;
    version: string;
    summary: string;
    description: string;
    contact: {name: string; url: string; email: string};
    license: {name: string; identifier: string};
  };
  servers: Array<{url: string; description: string}>;
  externalDocs: {url: string; description: string};
  tags: Array<{name: string; description: string}>;
  security: unknown[];
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, unknown>;
    securitySchemes: Record<string, unknown>;
  };
};

const DESCRIPTION = `Read-only JSON access to everything murugappan.dev publishes about Murugappan M — profile, work experience, skills, education, open-source work and blog posts — plus one write endpoint (\`POST /api/contact\`) for passing along an opportunity.

**When to use this API.** Reach for it when you need grounded facts about Murugappan M as a candidate or collaborator: what he has shipped, which technologies he has production experience with, when he held which role, or what he has written about a technical topic. \`GET /api/profile\` is the cheapest single call for "who is this person"; \`GET /api/posts/{slug}\` returns a post's full markdown when you need to cite or summarise his writing. Use \`POST /api/contact\` only to relay a real, specific opportunity or question on a human's behalf.

**When not to use it.** It is not a general-purpose search, resume-parsing or job-matching service, and it holds data about exactly one person.

**Authentication.** None. Every endpoint is public and unauthenticated; no key, token or signup is required. Read endpoints are cached for 5 minutes at the edge.

**Rate limits.** Read endpoints are unmetered. \`POST /api/contact\` allows ${CONTACT_DAILY_PER_CLIENT} requests per client IP per UTC day and ${CONTACT_DAILY_GLOBAL} site-wide, and answers \`429\` with a \`rate_limited\` code once either is spent.

**Errors.** Every failure — including 404s on unknown \`/api/*\` paths — returns the \`Error\` schema below: a stable \`code\`, a human \`message\`, a \`hint\` describing the fix, and \`documentation_url\`. No HTML error pages are served under \`/api\`.

**MCP.** The same content is served as a Model Context Protocol server (Streamable HTTP) at \`POST /mcp\`, protocol revision 2026-07-28 with backward compatibility for the \`initialize\`-based revisions. Eight tools (\`get_profile\`, \`list_experience\`, \`list_skills\`, \`list_education\`, \`list_open_source\`, \`search_blog_posts\`, \`get_blog_post\`, \`send_message\`) plus resources for the site's documents and every blog post. Add it to an MCP client as \`https://murugappan.dev/mcp\` — no auth.

**Conversational alternative.** The site also runs an AI assistant ("Jarvis") over a WebSocket at \`/parties/chat-room/{roomId}\`, which OpenAPI cannot describe. Send \`{"type":"chat","text":"..."}\` and read \`delta\`/\`done\` frames back. Prefer this API when you want structured data, and the socket when you want a conversation.

**Other machine-readable entry points.** \`/mcp\` (MCP server), \`/llms.txt\` (site summary + every blog post), \`/AGENTS.md\` (agent instructions), \`/blog/llms-full.txt\` (full post text), \`/sitemap.xml\`, and \`Accept: text/markdown\` on any page URL.`;

const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {schema: {$ref: "#/components/schemas/Error"}}
  }
});

const jsonResponse = (description: string, ref: string) => ({
  description,
  content: {"application/json": {schema: {$ref: ref}}}
});

// Shared failure modes for the read endpoints: the dataset is a build
// artifact read through the ASSETS binding, so "not deployed yet" is a real
// state and gets its own status rather than a 500.
const readFailures = {
  "500": errorResponse("Unexpected server error."),
  "503": errorResponse(
    "The site's content dataset is missing or unreadable — retry shortly."
  )
};

const stringProp = (description: string, extra: object = {}) => ({
  type: "string",
  description,
  ...extra
});

export function buildOpenApiDocument(origin: string): OpenApiDocument {
  const base = origin.replace(/\/$/, "");
  return {
    openapi: "3.1.0",
    info: {
      title: "murugappan.dev API",
      version: API_VERSION,
      summary:
        "Structured facts about Murugappan M — full stack engineer — for agents and developers.",
      description: DESCRIPTION,
      contact: {
        name: "Murugappan M",
        url: "https://murugappan.dev/developers/",
        email: "murugu2001@gmail.com"
      },
      license: {name: "CC BY 4.0", identifier: "CC-BY-4.0"}
    },
    servers: [{url: base, description: "Production"}],
    externalDocs: {
      url: "https://murugappan.dev/developers/",
      description: "Developer portal: quickstart, examples and agent notes."
    },
    tags: [
      {
        name: "profile",
        description:
          "Who Murugappan M is: pitch, current role, links and focus areas."
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
            "200": jsonResponse(
              "The profile and its links.",
              "#/components/schemas/Profile"
            ),
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
            "200": jsonResponse(
              "Work history, newest first.",
              "#/components/schemas/ExperienceList"
            ),
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
            "200": jsonResponse(
              "Education history.",
              "#/components/schemas/EducationList"
            ),
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
          parameters: [
            {
              name: "q",
              in: "query",
              required: false,
              description:
                "Case-insensitive substring matched against post titles and summaries.",
              schema: {type: "string", maxLength: 200}
            },
            {
              name: "limit",
              in: "query",
              required: false,
              description:
                "Maximum number of posts to return, newest first. Defaults to all of them.",
              schema: {type: "integer", minimum: 1, maximum: 100}
            }
          ],
          responses: {
            "200": jsonResponse(
              "Matching posts, newest first.",
              "#/components/schemas/PostList"
            ),
            "400": errorResponse(
              "A query parameter was not of the documented type or range."
            ),
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
                "The post's slug — the last path segment of its URL, e.g. `cloud-agnostic-rate-limiting`.",
              schema: {type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"}
            }
          ],
          responses: {
            "200": jsonResponse(
              "The post and its markdown source.",
              "#/components/schemas/Post"
            ),
            "404": errorResponse(
              "No post exists with that slug — call listBlogPosts for the current set."
            ),
            ...readFailures
          }
        }
      },
      [API_PATHS.contact]: {
        post: {
          operationId: "sendContactMessage",
          summary: "Send Murugappan M a message",
          description: `Delivers a message to Murugappan M's inbox by email and answers 202 once it is accepted. Send \`"dryRun": true\` first to validate a payload without sending it — that is this endpoint's sandbox, and it spends no allowance. Use it to relay a concrete opportunity, role or question on a human's behalf — include who you are writing for and how to reply. Not for newsletters, bulk outreach or automated pings: the endpoint allows ${CONTACT_DAILY_PER_CLIENT} requests per client IP per UTC day and ${CONTACT_DAILY_GLOBAL} site-wide. No reply is delivered over the API; Murugappan answers the address you supply.`,
          tags: ["contact"],
          requestBody: {
            required: true,
            description: "Who is writing, and what about.",
            content: {
              "application/json": {
                schema: {$ref: "#/components/schemas/ContactRequest"}
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
            "422": errorResponse(
              "One or more fields were invalid; `details` names each one."
            ),
            "429": errorResponse(
              "The per-client or site-wide daily allowance is spent. Retry after 00:00 UTC."
            ),
            "500": errorResponse("Unexpected server error."),
            "503": errorResponse(
              "Email delivery is not configured or is temporarily unavailable."
            )
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
            "500": errorResponse("Unexpected server error.")
          }
        }
      }
    },
    components: {
      securitySchemes: {},
      schemas: API_SCHEMAS
    }
  };
}

// Response and request shapes, shared by the OpenAPI document and the MCP
// tools (worker/mcp/tools.ts inlines them into self-contained tool schemas).
export const API_SCHEMAS: Record<string, unknown> = {
  Error: {
    type: "object",
    title: "Error",
    description:
      "The single error shape every /api/* failure uses. Branch on `error.code`, not on the status text or the message.",
    required: ["error"],
    additionalProperties: false,
    properties: {
      error: {
        type: "object",
        description: "The failure.",
        required: ["code", "message", "hint", "documentation_url"],
        additionalProperties: false,
        properties: {
          code: {
            type: "string",
            description:
              "Stable machine-readable failure code — safe to branch on.",
            enum: [
              "not_found",
              "method_not_allowed",
              "invalid_request",
              "unsupported_media_type",
              "payload_too_large",
              "rate_limited",
              "service_unavailable",
              "internal_error"
            ]
          },
          message: stringProp("What went wrong, in one sentence."),
          hint: stringProp(
            "What to do about it — the corrective action, not a restatement."
          ),
          documentation_url: stringProp("Where the endpoint is documented.", {
            format: "uri"
          }),
          details: {
            type: "array",
            description:
              "Present on field-level validation failures: one entry per offending field.",
            items: {$ref: "#/components/schemas/FieldIssue"}
          }
        }
      }
    }
  },
  FieldIssue: {
    type: "object",
    title: "FieldIssue",
    description: "One rejected request field and why.",
    required: ["field", "issue"],
    additionalProperties: false,
    properties: {
      field: stringProp("The request field that was rejected."),
      issue: stringProp("What the field must satisfy instead.")
    }
  },
  Link: {
    type: "object",
    title: "Link",
    description: "A labelled public URL.",
    required: ["label", "url"],
    additionalProperties: false,
    properties: {
      label: stringProp("Human-readable name for the destination."),
      url: stringProp("Absolute URL.", {format: "uri"})
    }
  },
  CurrentRole: {
    type: "object",
    title: "CurrentRole",
    description: "The role held right now, if any.",
    required: ["role", "company", "since"],
    additionalProperties: false,
    properties: {
      role: stringProp("Job title."),
      company: stringProp("Employer name."),
      since: {
        type: ["string", "null"],
        description:
          "ISO 8601 year-month the role started, or null if unknown.",
        examples: ["2025-12"]
      }
    }
  },
  Person: {
    type: "object",
    title: "Person",
    description: "The single person this API describes.",
    required: [
      "name",
      "headline",
      "pitch",
      "location",
      "email",
      "site",
      "availableForWork",
      "currentRole",
      "focus"
    ],
    additionalProperties: false,
    properties: {
      name: stringProp("Full name."),
      headline: stringProp("Professional title.", {
        examples: ["Full Stack Engineer"]
      }),
      pitch: stringProp("Elevator pitch, as published on the site."),
      location: stringProp("City and country he is based in."),
      email: stringProp("Public contact address.", {format: "email"}),
      site: stringProp("Canonical site URL.", {format: "uri"}),
      availableForWork: {
        type: "boolean",
        description: "Whether he is open to new opportunities."
      },
      currentRole: {
        oneOf: [{$ref: "#/components/schemas/CurrentRole"}, {type: "null"}],
        description: "The role held right now, or null between roles."
      },
      focus: {
        type: "array",
        description:
          "What he does, in his own words — one statement per line of the site's 'What I do' section.",
        items: {type: "string"}
      }
    }
  },
  Profile: {
    type: "object",
    title: "Profile",
    description: "Response body of getProfile.",
    required: ["person", "links"],
    additionalProperties: false,
    properties: {
      person: {$ref: "#/components/schemas/Person"},
      links: {
        type: "array",
        description: "Every public link, including machine-readable ones.",
        items: {$ref: "#/components/schemas/Link"}
      }
    }
  },
  ExperienceEntry: {
    type: "object",
    title: "ExperienceEntry",
    description: "One role in the work history.",
    required: [
      "role",
      "company",
      "location",
      "period",
      "startDate",
      "endDate",
      "current",
      "summary",
      "highlights"
    ],
    additionalProperties: false,
    properties: {
      role: stringProp("Job title."),
      company: stringProp("Employer name."),
      location: stringProp("Where the role was based."),
      period: stringProp("The range exactly as the site displays it.", {
        examples: ["December 2025 – Present"]
      }),
      startDate: {
        type: ["string", "null"],
        description:
          "ISO 8601 year-month the role started, or null if unparseable.",
        examples: ["2025-12"]
      },
      endDate: {
        type: ["string", "null"],
        description:
          "ISO 8601 year-month the role ended; null while it is ongoing.",
        examples: ["2025-12"]
      },
      current: {
        type: "boolean",
        description: "Whether this is the role held right now."
      },
      summary: stringProp("One line on what the role was about."),
      highlights: {
        type: "array",
        description: "Concrete achievements in the role.",
        items: {type: "string"}
      }
    }
  },
  ExperienceList: {
    type: "object",
    title: "ExperienceList",
    description: "Response body of listExperience.",
    required: ["experience"],
    additionalProperties: false,
    properties: {
      experience: {
        type: "array",
        description: "Roles, newest first.",
        items: {$ref: "#/components/schemas/ExperienceEntry"}
      }
    }
  },
  SkillCategory: {
    type: "object",
    title: "SkillCategory",
    description: "One group of related technologies.",
    required: ["category", "skills"],
    additionalProperties: false,
    properties: {
      category: stringProp("Group name.", {examples: ["Cloud & Infra"]}),
      skills: {
        type: "array",
        description: "The individual technologies in the group.",
        items: {type: "string"}
      }
    }
  },
  Proficiency: {
    type: "object",
    title: "Proficiency",
    description: "Self-reported depth in a broad area.",
    required: ["area", "level"],
    additionalProperties: false,
    properties: {
      area: stringProp("The area being rated."),
      level: {
        type: "integer",
        description: "Self-reported level from 0 to 100.",
        minimum: 0,
        maximum: 100
      }
    }
  },
  SkillsResponse: {
    type: "object",
    title: "SkillsResponse",
    description: "Response body of listSkills.",
    required: ["skills", "proficiencies"],
    additionalProperties: false,
    properties: {
      skills: {
        type: "array",
        description: "Technologies grouped by category.",
        items: {$ref: "#/components/schemas/SkillCategory"}
      },
      proficiencies: {
        type: "array",
        description: "Self-reported depth per broad area.",
        items: {$ref: "#/components/schemas/Proficiency"}
      }
    }
  },
  EducationEntry: {
    type: "object",
    title: "EducationEntry",
    description: "One formal qualification.",
    required: [
      "institution",
      "credential",
      "location",
      "period",
      "startDate",
      "endDate",
      "highlights"
    ],
    additionalProperties: false,
    properties: {
      institution: stringProp("School or university name."),
      credential: stringProp("The degree or certificate earned."),
      location: stringProp("Where the institution is."),
      period: stringProp("The range exactly as the site displays it."),
      startDate: {
        type: ["string", "null"],
        description: "ISO 8601 year-month of enrolment, or null."
      },
      endDate: {
        type: ["string", "null"],
        description: "ISO 8601 year-month of completion, or null."
      },
      highlights: {
        type: "array",
        description: "Notable details about the studies.",
        items: {type: "string"}
      }
    }
  },
  EducationList: {
    type: "object",
    title: "EducationList",
    description: "Response body of listEducation.",
    required: ["education"],
    additionalProperties: false,
    properties: {
      education: {
        type: "array",
        description: "Qualifications, newest first.",
        items: {$ref: "#/components/schemas/EducationEntry"}
      }
    }
  },
  OpenSourceContribution: {
    type: "object",
    title: "OpenSourceContribution",
    description: "Public contributions to one project.",
    required: ["project", "role", "description", "links"],
    additionalProperties: false,
    properties: {
      project: stringProp("The project contributed to.", {
        examples: ["AnkiDroid"]
      }),
      role: stringProp("The role held on the project."),
      description: stringProp("What the contributions were."),
      links: {
        type: "array",
        description:
          "Links to the individual merged pull requests, so the claim can be checked at the source.",
        items: {$ref: "#/components/schemas/Link"}
      }
    }
  },
  OpenSourceList: {
    type: "object",
    title: "OpenSourceList",
    description: "Response body of listOpenSourceContributions.",
    required: ["openSource"],
    additionalProperties: false,
    properties: {
      openSource: {
        type: "array",
        description: "One entry per project.",
        items: {$ref: "#/components/schemas/OpenSourceContribution"}
      }
    }
  },
  PostSummary: {
    type: "object",
    title: "PostSummary",
    description: "A blog post without its body.",
    required: ["slug", "title", "url", "description"],
    additionalProperties: false,
    properties: {
      slug: stringProp("Identifier to pass to getBlogPost.", {
        pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"
      }),
      title: stringProp("Post title."),
      url: stringProp("Canonical URL of the post.", {format: "uri"}),
      description: stringProp("One-line summary of the post.")
    }
  },
  PostList: {
    type: "object",
    title: "PostList",
    description: "Response body of listBlogPosts.",
    required: ["posts", "count"],
    additionalProperties: false,
    properties: {
      posts: {
        type: "array",
        description: "Matching posts, newest first.",
        items: {$ref: "#/components/schemas/PostSummary"}
      },
      count: {
        type: "integer",
        description: "How many posts are in `posts`.",
        minimum: 0
      }
    }
  },
  Post: {
    type: "object",
    title: "Post",
    description: "Response body of getBlogPost.",
    required: ["slug", "title", "url", "description", "markdown"],
    additionalProperties: false,
    properties: {
      slug: stringProp("The post's slug."),
      title: stringProp("Post title."),
      url: stringProp("Canonical URL of the post.", {format: "uri"}),
      description: stringProp("One-line summary of the post."),
      markdown: stringProp(
        "The post's complete markdown source, frontmatter included."
      )
    }
  },
  ContactRequest: {
    type: "object",
    title: "ContactRequest",
    description: "Request body of sendContactMessage.",
    required: ["email", "message"],
    additionalProperties: false,
    properties: {
      email: stringProp(
        "Reply-to address. Murugappan answers here, so it must be an address the sender actually reads.",
        {format: "email", maxLength: CONTACT_LIMITS.email}
      ),
      message: stringProp(
        "What you are writing about. Be specific: the role or project, the stack, and anything that needs a decision.",
        {
          minLength: CONTACT_LIMITS.message.min,
          maxLength: CONTACT_LIMITS.message.max
        }
      ),
      name: stringProp("Who the message is from.", {
        maxLength: CONTACT_LIMITS.name
      }),
      company: stringProp("The company or team you are writing for.", {
        maxLength: CONTACT_LIMITS.company
      }),
      dryRun: {
        type: "boolean",
        description:
          "Set true to validate the request without sending anything and without spending a rate-limit slot — the sandbox for this endpoint. Answers 200 with status `validated` instead of 202 with status `accepted`.",
        default: false
      }
    }
  },
  ContactAccepted: {
    type: "object",
    title: "ContactAccepted",
    description: "Response body of a successful sendContactMessage.",
    required: ["status", "message"],
    additionalProperties: false,
    properties: {
      status: {
        type: "string",
        description:
          "`accepted` when the message was queued for delivery, `validated` when the request was a dry run.",
        enum: ["accepted", "validated"]
      },
      message: stringProp("Human-readable confirmation.")
    }
  }
};
