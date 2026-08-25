# AGENTS.md — murugappan.dev

Agent instructions for murugappan.dev, the personal site and public API of
**Murugappan M**, a full stack engineer (TypeScript, Node.js, React, AWS) based
in Bangalore, India, currently Software Engineer II at MedMe Health.

Canonical machine-readable contract: <https://murugappan.dev/openapi.json>
Human documentation: <https://murugappan.dev/developers/>
API catalogue (RFC 9727): <https://murugappan.dev/.well-known/api-catalog>
MCP server manifest: <https://murugappan.dev/.well-known/mcp.json>

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
- Not a mailing endpoint. `POST /api/v1/contact` is for one concrete opportunity
  or question on a human's behalf — not newsletters, bulk outreach or pings.
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

If your client installs servers from a manifest rather than a pasted URL, the
`server.json` document is at `https://murugappan.dev/.well-known/mcp.json`
(also `/mcp.json`). It follows the published server.json schema, names the
server `dev.murugappan/murugappan-dev`, and declares one `streamable-http`
remote pointing at `https://murugappan.dev/mcp`.

## How to call it over HTTP

Base URL `https://murugappan.dev/api/v1`. **No authentication, no API key, no
signup.** JSON in, JSON out, permissive CORS. Read endpoints are cached
5 minutes.

| Need                | Call                                               |
| ------------------- | -------------------------------------------------- |
| Who is this person  | `GET /api/v1/profile`                              |
| Dated work history  | `GET /api/v1/experience`                           |
| Does he know X      | `GET /api/v1/skills`                               |
| Degrees             | `GET /api/v1/education`                            |
| Verifiable OSS work | `GET /api/v1/open-source`                          |
| Find writing on X   | `GET /api/v1/posts?q=X&limit=5`                    |
| Read one post       | `GET /api/v1/posts/{slug}` (returns full markdown) |
| Send him a message  | `POST /api/v1/contact`                             |
| Version policy      | `GET /api/v1/versions`                             |
| The full contract   | `GET /openapi.json`                                |

Start with `GET /api/v1/profile` — it is one request and answers most
questions. The unversioned `/api/…` prefix works too and always will; see
[Versioning](#versioning).

### Sending a message

```json
POST /api/v1/contact
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

## Versioning

The version is a path segment: `/api/v1/…`. There is no version header and no
version query parameter — the URL _is_ the version.

- The unversioned `/api/…` prefix is a **permanent alias** for `v1`. It will
  never be repointed at a later major version, so either form is safe to
  hard-code.
- Additive changes ship inside a version without notice (new endpoints, new
  optional request fields, new response fields). Ignore fields you do not
  recognise rather than rejecting the response.
- Breaking changes never ship inside a version. A removal, a rename, a type
  change, a narrowed enum or a changed status-code meaning all require a new
  path version.
- Every response carries `API-Version` (the release that answered) and
  `API-Supported-Versions`, plus `Link: </api/v1/versions>;
rel="version-history"`.
- A deprecated version answers every request with `Deprecation` (RFC 9745) and
  `Sunset` (RFC 8594) headers and `Link` relations `deprecation` and
  `successor-version`. At least 180 days pass between the first `Deprecation`
  header and the sunset date; after sunset the version answers `410`.

`GET /api/v1/versions` (also `/api/versions`) is this policy as data — read it
before hard-coding a base path.

## Rate limits

Every response carries the IETF `RateLimit` header fields, so you can
self-throttle without reading this file. `RateLimit-Policy` lists the quota
policies that apply; `RateLimit` is the live snapshot of the one closest to
exhaustion (`r` = remaining, `t` = seconds to reset). The de-facto
`X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` mirror the
same numbers, and a `429` adds `Retry-After`.

```
RateLimit-Policy: "reads";q=600;w=60
RateLimit: "reads";r=599;t=60
```

- **Reads** are effectively unmetered: a fair-use ceiling of 600 requests per
  60 seconds per client address, counted in the edge location serving you, so
  the advertised number is a floor rather than a cap.
- **`POST /api/v1/contact`** is genuinely metered: 3 per client IP per UTC day,
  20 site-wide, `RateLimit-Policy: "contact-client";q=3;w=86400,
"contact-site";q=20;w=86400`. A rejected request spends nothing, and neither
  does a dry run — but a dry run still reports the allowance, so use it to size
  a real send.

Every one of these headers is listed in `Access-Control-Expose-Headers`, so a
browser-side agent can read them too.

## Webhooks

There are none — this API has no events to push. Poll instead: read endpoints
are cacheable for five minutes, `GET /api/v1/posts` is one cheap call, and
`/blog/rss.xml` announces new posts. `POST /api/v1/contact` delivers by email
and returns no callback.

## Errors

Every failure under `/api` — 404s included — returns one JSON shape. There is
never an HTML error page under `/api`. Branch on `error.code`, not the message.

```json
{
  "error": {
    "code": "not_found",
    "message": "There is no API endpoint at /api/v1/nope.",
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

**Off the API**, a path that does not exist answers a real `404` — never a
`200` with an app shell. The body is content-negotiated: ask for HTML and you
get the styled page; ask for anything else (or send no `Accept` at all) and you
get a short markdown body listing the sitemap, this file, the developer portal,
the OpenAPI document, the API catalogue and the MCP manifest. One request is
enough to recover from a guessed or stale URL.

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
- **Discovery documents.** `/.well-known/api-catalog` (RFC 9727 link set naming
  every API here and where each is described) and `/.well-known/mcp.json` (this
  site's MCP `server.json`). Probe the catalogue first if you know nothing else
  about this site.

## Crawling and reuse

Crawling, AI retrieval and AI training are all explicitly permitted — see
`/robots.txt` (`Content-Signal: search=yes, ai-input=yes, ai-train=yes`). Data
is licensed CC BY 4.0; cite <https://murugappan.dev/>.

## Contact

`POST /api/v1/contact`, or <mailto:murugu2001@gmail.com>.
