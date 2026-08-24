import {Hono} from "hono";
import {partyserverMiddleware} from "hono-party";

import {api, specRoutes} from "./api";
import {ChatRoom} from "./chat-room";
import {mcp} from "./mcp";
import {RateLimiter} from "./rate-limiter";

export {ChatRoom, RateLimiter};

const app = new Hono<{Bindings: Env}>();

// Claims /parties/:party/:room (WebSocket upgrades and HTTP) for the Durable
// Objects; everything else falls through to the next handler.
app.use("*", partyserverMiddleware());

// The public JSON API. Claimed by the Worker (not static assets) so that
// every /api/* failure is a JSON error envelope instead of the HTML 404 page
// — keep the run_worker_first list in wrangler.jsonc in sync with these.
app.route("/api", api);
app.route("/openapi.json", specRoutes);

// Model Context Protocol server (Streamable HTTP) over the same content.
app.route("/mcp", mcp);

// run_worker_first routes only /parties/*, /api/*, /openapi.json and /mcp
// here; anything else that reaches the Worker falls through to static assets.
app.all("*", c => c.env.ASSETS.fetch(c.req.raw));

export default app;
