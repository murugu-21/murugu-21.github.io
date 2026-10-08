# MCP server

An MCP client adds `/mcp` and gets the site's content as tools and resources over Streamable HTTP, with no auth and no session. The `server.json` manifest tells it how to connect.

## Sub-features

- `mcp-manifest` serves a manifest whose remote names the answering host.
- `mcp-initialize` completes the `initialize` handshake that clients older than revision `2026-07-28` send.
- `mcp-tools-list` lists the tools.
- `mcp-tools-call` runs a tool and returns its JSON as text content.

## How to get to it (user POV)

- `GET /mcp.json` or `/.well-known/mcp.json`.
- `POST /mcp` with a JSON-RPC body.

## Driving it with curl

Preconditions:

- `B=http://localhost:8791; E="$RUN/evidence/mcp-server"; mkdir -p "$E"`.
- `H=(-H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream')`.

Steps:

- **`mcp-manifest`.** `curl -sS "$B/mcp.json" -o "$E/mcp-manifest.body"`. `name` is `dev.murugappan/murugappan-dev`, and the `streamable-http` remote's `url` is `http://localhost:8791/mcp`.
- **`mcp-initialize`.** `curl -sS -X POST "$B/mcp" "${H[@]}" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"verify","version":"0"}}}'`. It answers as SSE (`event: message`). The `data:` JSON has `result.protocolVersion` `2025-11-25` and `serverInfo.name` `murugappan.dev`.
- **`mcp-tools-list`.** The same call with `{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}`. `result.tools` includes `get_profile`, `search_blog_posts`, `get_blog_post` and `send_message`.
- **`mcp-tools-call`.** The same call with `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_blog_posts","arguments":{"query":"rate"}}}`. `result.content[0].text` is JSON whose `posts` match the REST `/api/v1/posts?q=rate`.

## Gotchas

- Without both `Accept` types the `initialize` path answers `406`, and without `Content-Type: application/json` it answers `415`.
- `GET` and `DELETE` on `/mcp` answer `405`. Only `POST` works.
- `send_message` shares the contact endpoint's three daily slots. Pass `dryRun: true` unless the send is the thing you're proving.
