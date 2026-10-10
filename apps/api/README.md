# Worker

`src/server.ts` is the entry point. The [public API](src/api/README.md) and the [MCP server](src/mcp/README.md) have their own READMEs.

Cloudflare serves pages straight from the built site. The Worker only runs for the routes in `run_worker_first` in `wrangler.jsonc`, and for requests that match no page. If you add a route to `server.ts`, add it there too.

## The 404 page

A browser gets the normal 404 page. Anything else, like curl or an AI agent, gets a short markdown guide to the site. Both get a real 404 status.

The Worker also serves `/.well-known/api-catalog` and `/.well-known/mcp.json`, which tell agents where the API and the MCP server are.

## Jarvis

Jarvis is the chat widget on every page. The widget is in `apps/site/src/components/chat/`. Each conversation is a `ChatRoom` Durable Object (`src/chat-room.ts`), and replies come from DeepSeek.

To run it locally, put `DEEPSEEK_API_KEY=sk-...` in `apps/api/.dev.vars`, then run `bun run build && bun run preview`. Without the key, the chat turns itself off. Local chats call the real API and cost real money.

Things to know:

- After changing `DEEPSEEK_MODEL`, run `bun run test:live` before pushing. It checks that the new model really emails a lead instead of only saying it did.
- `ChatRoom` only accepts a small set of message types from the browser.
- Chat stops when the DeepSeek balance runs low. Each room also has a daily message limit.
- `agents` and `@cloudflare/ai-chat` are pinned to exact versions because minor releases break them. Read their changelogs before upgrading.
- Don't put `OPPORTUNITY_INBOX` in `.dev.vars`. It overrides the real value, and the email binding only sends to that one address.
- The widget downloads on the visitor's first input, so a page that's only loaded never fetches it.
