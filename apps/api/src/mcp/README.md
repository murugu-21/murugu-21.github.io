# MCP server

The site's content as an [MCP](https://modelcontextprotocol.io) server at `https://murugappan.dev/mcp`. No auth, no sessions, `POST` only.

- It uses the official SDK. A new server is built for each request, because the tools need that request's client IP.
- The tool list is `MCP_TOOLS` in `packages/contracts/mcp.ts`. Each tool needs a handler in `tools.ts`, or the type check fails. The `/developers` page lists tools from the same list.
- `send_message` runs the same delivery program as `POST /api/v1/contact` (`apps/api/src/programs/contact-delivery.ts`), so the two share a daily limit. Its text for each outcome is in `tools.ts`.
- It speaks protocol version `2026-07-28` and still accepts older clients' handshakes. Older clients must send `Accept: application/json, text/event-stream`.
