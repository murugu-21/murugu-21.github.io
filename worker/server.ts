import {Hono} from "hono";
import {partyserverMiddleware} from "hono-party";

import {api, specRoutes} from "./api";
import {ChatRoom} from "./chat-room";
import {mcp} from "./mcp";
import {serveAsset} from "./not-found";
import {RateLimiter} from "./rate-limiter";
import {mcpManifest, wellKnown} from "./well-known";

export {ChatRoom, RateLimiter};

const app = new Hono<{Bindings: Env}>();

// Claims /parties/:party/:room (WebSocket upgrades and HTTP) for the Durable
// Objects; everything else falls through to the next handler.
app.use("*", partyserverMiddleware());

// The public JSON API. Claimed by the Worker (not static assets) so that
// every /api/* failure is a JSON error envelope instead of the HTML 404 page
// — keep the run_worker_first list in wrangler.jsonc in sync with these.
//
// Mounted twice: the explicitly versioned prefix first, so /api/v1/profile
// matches its own route rather than the unversioned catch-all, and then the
// unversioned prefix, which is a permanent alias for v1 (api/versioning.ts).
app.route("/api/v1", api);
app.route("/api", api);
app.route("/openapi.json", specRoutes);

// Model Context Protocol server (Streamable HTTP) over the same content, and
// its server.json manifest. The manifest routes are registered before /mcp so
// /mcp.json is never mistaken for a JSON-RPC request.
app.route("/mcp.json", mcpManifest);
app.route("/.well-known", wellKnown);
app.route("/mcp", mcp);

// Anything else is static assets. A 404 from that layer is content-negotiated:
// markdown for a machine client, the styled page for a browser.
app.all("*", c => serveAsset(c.req.raw, c.env.ASSETS));

export default app;
