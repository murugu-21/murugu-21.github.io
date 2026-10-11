# The MCP server

`apps/api/src/modules/mcp/README.md` describes the server. The tool descriptors live in `packages/contracts/mcp.ts`.

**Lint and types cover.** The `McpToolDescriptor` type requires `inputSchema`, `outputSchema` and `annotations`. MCP handlers follow the controller rules in [hono.md](hono.md), including the import bans.

Rules lint can't check:

- **MCP-1.** Declare each tool's name, zod `inputSchema` and `outputSchema` in `packages/contracts/mcp.ts`, with a `.meta({ description })` on every field. A tool with no arguments uses `NO_ARGS`.
- **MCP-2.** Annotations match the behaviour. `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint` are what a client uses to decide whether to ask the user.
- **MCP-3.** Return anything the model could fix or retry as an `isError` result with text that says what to change. Throw a protocol error only for a malformed request or an unknown resource. Don't re-`parse` arguments the SDK already validated, because a mismatch then throws instead of returning `isError`.
- **MCP-4.** Return `structuredContent` that matches `outputSchema` and its JSON as text, through `ok()`.
- **MCP-5.** Every tool and resource read is rate-limited, not only `send_message`. The spec requires it.
- **MCP-6.** An MCP tool and its `/api/v1` twin call the same service, so they return the same data.
- **MCP-7.** Keep the per-request server factory cheap and free of side effects, and keep the `Origin` guard in front of `createMcpHandler`.
- **MCP-8.** Keep `tools/list` a static array in a fixed order. Clients cache it.

Sources: https://modelcontextprotocol.io/specification/2025-11-25/server/tools, https://modelcontextprotocol.io/specification/2025-11-25/basic/transports, https://ts.sdk.modelcontextprotocol.io/v2/servers/tools, https://ts.sdk.modelcontextprotocol.io/v2/serving/http.
