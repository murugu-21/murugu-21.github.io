# MCP server

The site's content as an [MCP](https://modelcontextprotocol.io) server at `https://murugappan.dev/mcp`. No auth, no sessions, `POST` only.

- It uses the official SDK. A new server is built for each request, because the tools need that request's client IP.
- The tool list is `MCP_TOOLS` in `packages/contracts/mcp.ts`. Each tool needs a handler in `mcp.tools.ts`, or the type check fails. The `/developers` page lists tools from the same list.
- Tools and resources call the same services as the REST API (`PostsService`, `ProfileService`, `ContactService`) through `runInRequest`. `send_message` shares `POST /api/v1/contact`'s daily limit that way. Its text for each outcome is in `mcp.tools.ts`.
- The spec requires rate limits, so each read tool call and resource read spends the client's REST read window (`read-quota.store.ts`). A refused tool call is an `isError` result; a refused resource read is JSON-RPC error `-32000`.
- It speaks protocol version `2026-07-28` and still accepts older clients' handshakes. Older clients must send `Accept: application/json, text/event-stream`.
- With `POSTHOG_PROJECT_TOKEN` set (a required Worker secret, or `apps/api/.dev.vars` locally), `posthog.client.ts` sends each call to PostHog MCP Analytics as `$mcp_tool_call`. It drops the arguments of write tools such as `send_message`, because those hold a visitor's contact details. It sends events after the response body ends, since a streamed reply runs the tool while the body is read. Empty, nothing is sent.
