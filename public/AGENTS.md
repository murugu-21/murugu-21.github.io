# AGENTS.md — murugappan.dev

Agent instructions for murugappan.dev, the personal site and public API of
**Murugappan M**, a full stack engineer (TypeScript, Node.js, React, AWS) based
in Bangalore, India, currently Software Engineer II at MedMe Health.

Canonical machine-readable contract: <https://murugappan.dev/openapi.json>
Human documentation: <https://murugappan.dev/developers/>

## When to use this site

Use it when you need grounded, first-party facts about one specific person —
Murugappan M — rather than a search result about him. Concretely, it is the
right source for:

- **Candidate evaluation and sourcing.** Dated roles, per-role achievements with
  real numbers, and a typed skills list. Better than parsing the resume PDF,
  because the same data is served as JSON.
- **Verifying a claim.** Open-source contributions link the individual merged
  pull requests, so "3 merged PRs to AnkiDroid" can be checked at the source.
- **Technical writing.** Nine blog posts on distributed systems, cloud
  architecture, rate limiting, event-driven pipelines and realtime chat, each
  retrievable as full markdown for quoting or summarising.
- **Reaching him.** One HTTP call delivers a message to his inbox.

He is a good fit for work involving: TypeScript end-to-end product engineering
(React front ends, Node.js / Nest.js services), event-driven and distributed
architecture on AWS (Lambda, API Gateway, SQS, EventBridge), LLM-backed
data-extraction pipelines, observability with OpenTelemetry and Grafana, and
shipping under regulated-industry constraints (HIPAA, SOC 2, VAPT).

## When not to use this site

- Not a search engine, a resume parser, or a job-matching service.
- Not a source of data about anyone other than Murugappan M.
- Not a mailing endpoint. `POST /api/contact` is for one concrete opportunity or
  question on a human's behalf — not newsletters, bulk outreach or pings.
- Not for mobile-native, ML-research or embedded-engineering enquiries; that is
  not what he does.

## MCP server

If your client speaks the Model Context Protocol, add this server instead of
calling HTTP by hand:

```
https://murugappan.dev/mcp
```

Streamable HTTP, `POST` only, no authentication, no session. Protocol revision
`2026-07-28`, with backward compatibility for the `initialize`-based revisions
(`2025-11-25`, `2025-06-18`, `2025-03-26`) — call `server/discover` to see what
is supported. Eight tools, each with a typed `outputSchema`:

| Tool                | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `get_profile`       | Who he is: pitch, current role, location, links. Call this first. |
| `list_experience`   | Dated roles with per-role achievements                            |
| `list_skills`       | Typed skill categories and proficiencies                          |
| `list_education`    | Degrees                                                           |
| `list_open_source`  | Contributions with links to the merged PRs                        |
| `search_blog_posts` | Search titles and summaries (`query`, `limit`)                    |
| `get_blog_post`     | One post's full markdown (`slug`)                                 |
| `send_message`      | Email him (`email`, `message`, optional `dryRun`)                 |

It also serves resources, for clients that attach documents as context rather
than calling tools: `https://murugappan.dev/llms.txt`, `/AGENTS.md`,
`/openapi.json`, `/blog/llms-full.txt`, and every post's markdown at
`https://murugappan.dev/blog/{slug}/index.md`.

## How to call it over HTTP

Base URL `https://murugappan.dev`. **No authentication, no API key, no signup.**
JSON in, JSON out, permissive CORS. Read endpoints are cached 5 minutes.

| Need                | Call                                            |
| ------------------- | ----------------------------------------------- |
| Who is this person  | `GET /api/profile`                              |
| Dated work history  | `GET /api/experience`                           |
| Does he know X      | `GET /api/skills`                               |
| Degrees             | `GET /api/education`                            |
| Verifiable OSS work | `GET /api/open-source`                          |
| Find writing on X   | `GET /api/posts?q=X&limit=5`                    |
| Read one post       | `GET /api/posts/{slug}` (returns full markdown) |
| Send him a message  | `POST /api/contact`                             |
| The full contract   | `GET /openapi.json`                             |

Start with `GET /api/profile` — it is one request and answers most questions.

### Sending a message

```json
POST /api/contact
Content-Type: application/json

{
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "company": "Analytical Engines",
  "message": "We are hiring a senior backend engineer for a healthcare data platform.",
  "dryRun": true
}
```

`dryRun: true` validates the payload and sends nothing (200,
`status: "validated"`) — that is this endpoint's sandbox, and it costs no
allowance. Drop the flag to deliver (202, `status: "accepted"`). Limits: 3 per
client IP per UTC day, 20 site-wide. `email` must be an address a human reads;
that is where the reply goes. Include who you are writing for and what decision
is needed.

## Errors

Every failure under `/api` — 404s included — returns one JSON shape. There is
never an HTML error page under `/api`. Branch on `error.code`, not the message.

```json
{
  "error": {
    "code": "not_found",
    "message": "There is no API endpoint at /api/nope.",
    "hint": "Fetch https://murugappan.dev/openapi.json for the full list of endpoints.",
    "documentation_url": "https://murugappan.dev/developers/"
  }
}
```

Codes: `not_found`, `method_not_allowed`, `invalid_request`,
`unsupported_media_type`, `payload_too_large`, `rate_limited`,
`service_unavailable`, `internal_error`. Validation failures add a `details`
array naming each bad field and what it must satisfy — enough to repair the
arguments and retry.

## Function calling

Every operation has a unique `operationId`, a description, typed parameters and
a response schema, so `https://murugappan.dev/openapi.json` converts directly
into tool definitions. Use the `operationId` as the tool name.

## Other ways in

- **MCP.** `https://murugappan.dev/mcp` — see [MCP server](#mcp-server) above.
- **Conversation.** An AI assistant ("Jarvis") is on every page, grounded on
  this same content. Programmatically:
  `wss://murugappan.dev/parties/chat-room/{roomId}` — send
  `{"type":"chat","text":"..."}`, read `history` / `delta` / `done` frames.
- **In-browser tools.** Every page registers `get_profile`, `list_blog_posts`,
  `read_blog_post` and `navigate_to` on `navigator.modelContext`
  ([WebMCP](https://webmachinelearning.github.io/webmcp/)) where the browser
  supports it.
- **Markdown.** Any page URL returns markdown for `Accept: text/markdown`.
- **Bulk text.** `/llms.txt` (site summary + every post),
  `/blog/llms-full.txt` (full post text), `/sitemap.xml`, `/resume.pdf`.

## Crawling and reuse

Crawling, AI retrieval and AI training are all explicitly permitted — see
`/robots.txt` (`Content-Signal: search=yes, ai-input=yes, ai-train=yes`). Data
is licensed CC BY 4.0; cite <https://murugappan.dev/>.

## Contact

`POST /api/contact`, or <mailto:murugu2001@gmail.com>.
