import { Hono } from "hono";
import { partyserverMiddleware } from "hono-party";

import { api, specRoutes } from "./api";
import { audio } from "./audio";
import { ChatRoom } from "./chat-room";
import { mcp } from "./mcp";
import { serveAsset } from "./not-found";
import { VISITOR_COUNTRY_HEADER, VISITOR_IP_HEADER } from "./protocol";
import { RateLimiter } from "./rate-limiter";
import { mcpManifest, wellKnown } from "./well-known";

export { ChatRoom, RateLimiter };

const app = new Hono<{ Bindings: Env }>();

// Claims /parties/:party/:room for the Durable Objects; the rest falls through.
app.use(
  "*",
  partyserverMiddleware<{ Bindings: Env }>({
    options: {
      // `request.cf` exists only on the edge request, so forward country and IP
      // as headers. Delete before set so a client-sent value can't pass as ours.
      onBeforeConnect: (req, _lobby, c) => {
        const cf = c.req.raw.cf as IncomingRequestCfProperties | undefined;
        const country = cf?.country ?? c.req.header("CF-IPCountry");
        const ip = c.req.header("CF-Connecting-IP");

        const headers = new Headers(req.headers);
        headers.delete(VISITOR_COUNTRY_HEADER);
        headers.delete(VISITOR_IP_HEADER);
        if (country) headers.set(VISITOR_COUNTRY_HEADER, country);
        if (ip) headers.set(VISITOR_IP_HEADER, ip);
        return new Request(req, { headers });
      }
    }
  })
);

// Keep wrangler.jsonc's run_worker_first list in sync with these routes.
// /api/v1 must mount before /api, the permanent unversioned alias for v1.
app.route("/api/v1", api);
app.route("/api", api);
app.route("/openapi.json", specRoutes);

// Manifest routes register before /mcp so /mcp.json isn't taken as JSON-RPC.
app.route("/mcp.json", mcpManifest);
app.route("/.well-known", wellKnown);
app.route("/mcp", mcp);

app.route("/blog/audio", audio);

// Asset and route misses: a content-negotiated 404 (pages bypass the Worker).
app.all("*", c => serveAsset(c.req.raw, c.env.ASSETS));

export default app;
