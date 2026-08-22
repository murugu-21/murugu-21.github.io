import {Hono} from "hono";
import {partyserverMiddleware} from "hono-party";

import {ChatRoom} from "./chat-room";
import {RateLimiter} from "./rate-limiter";

export {ChatRoom, RateLimiter};

const app = new Hono<{Bindings: Env}>();

// Claims /parties/:party/:room (WebSocket upgrades and HTTP) for the Durable
// Objects; everything else falls through to the next handler.
app.use("*", partyserverMiddleware());

// run_worker_first routes only /parties/* here; anything else that reaches
// the Worker falls through to static assets.
app.all("*", c => c.env.ASSETS.fetch(c.req.raw));

export default app;
