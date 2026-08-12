import {routePartykitRequest} from "partyserver";

import {ChatRoom} from "./chat-room";
import {RateLimiter} from "./rate-limiter";

export {ChatRoom, RateLimiter};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // run_worker_first routes only /parties/* here; anything else that
    // reaches the Worker falls through to static assets.
    return (
      (await routePartykitRequest(request, env as never)) ??
      env.ASSETS.fetch(request)
    );
  }
} satisfies ExportedHandler<Env>;
