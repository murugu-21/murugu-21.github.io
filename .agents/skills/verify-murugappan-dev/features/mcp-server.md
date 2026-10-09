# MCP server

An MCP client adds `/mcp` and gets the site's content as tools and resources over Streamable HTTP, with no auth and no session. The `server.json` manifest tells it how to connect.

## Sub-features

- `mcp-manifest` serves a manifest whose remote names the answering host.
- `mcp-initialize` completes the `initialize` handshake that clients older than revision `2026-07-28` send.
- `mcp-tools-list` lists the tools.
- `mcp-tools-call` runs a tool and returns its JSON as text content.
- `mcp-resources` lists the site documents and posts as resources and reads one.

## How to get to it (user POV)

- `GET /mcp.json` or `/.well-known/mcp.json`.
- `POST /mcp` with a JSON-RPC body, for tools or resources.

## Driving it with curl

Preconditions:

- `B=http://localhost:8791; E="$RUN/evidence/mcp-server"; mkdir -p "$E"`.
- `H=(-H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream')`.

Steps:

- **`mcp-manifest`.** `curl -sS "$B/mcp.json" -o "$E/mcp-manifest.body"`. `name` is `dev.murugappan/murugappan-dev`, and the `streamable-http` remote's `url` is `http://localhost:8791/mcp`.
- **`mcp-initialize`.** `curl -sS -X POST "$B/mcp" "${H[@]}" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"verify","version":"0"}}}'`. It answers as SSE (`event: message`). The `data:` JSON has `result.protocolVersion` `2025-11-25` and `serverInfo.name` `murugappan.dev`.
- **`mcp-tools-list`.** The same call with `{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}`. `result.tools` includes `get_profile`, `search_blog_posts`, `get_blog_post` and `send_message`.
- **`mcp-tools-call`.** The same call with `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_blog_posts","arguments":{"query":"rate"}}}`. `result.content[0].text` is JSON whose `posts` match the REST `/api/v1/posts?q=rate`.
- **`mcp-resources`.** The same call with `{"jsonrpc":"2.0","id":4,"method":"resources/list","params":{}}`. `result.resources` has a `uri` under `https://murugappan.dev` for `/llms.txt`, `/AGENTS.md`, `/openapi.json`, `/blog/llms-full.txt` and one `/blog/<slug>/index.md` per post. Then `{"jsonrpc":"2.0","id":5,"method":"resources/read","params":{"uri":"https://murugappan.dev/AGENTS.md"}}` returns `result.contents[0].text` starting `# AGENTS.md for murugappan.dev`. The URIs always name `https://murugappan.dev`, but the read is answered by this instance.

## Gotchas

- Every `POST` in these steps answers `406` without both `Accept` types, and `415` without `Content-Type: application/json`.
- `GET` and `DELETE` on `/mcp` answer `405`. Only `POST` works.
- `send_message` shares the contact endpoint's three daily slots. Pass `dryRun: true` unless the send is the thing you're proving.
