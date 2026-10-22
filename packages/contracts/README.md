# Contracts

The types and schemas the site, the Worker and the scripts all agree on: the API, the MCP tools, the chat messages, the audio files, blog frontmatter and the resume data in `packages/content/profile.json`.

Only shapes go here: zod schemas, types and constants. Lint rejects exported functions and classes. Put logic in the app that runs it.

`surface.ts` declares every agent-facing discovery document once (path, media type, title, relation) and which surfaces link to it. The generated `_headers`, the Worker's `Link` headers, the `<link>` tags, the api-catalog, the 404 body, the MCP resources and the agent documents all render from it, so a new document is one entry there plus a literal assertion in `packages/content/surface.test.ts`. The MCP endpoint `/mcp` stays out of `DOCUMENTS` because it is an endpoint to call, not a document to read.

`webmcp.ts` names the tools every page registers on `document.modelContext`. `apps/site/src/lib/webmcp.ts` must implement each one, or the type check fails, and the agent guide and the `/developers` page list them from it.
