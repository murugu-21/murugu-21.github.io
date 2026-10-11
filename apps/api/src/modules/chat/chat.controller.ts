import { routeAgentRequest } from "agents";
import { Hono, type Context } from "hono";

import type { AppEnv } from "#src/common/app-env.ts";
import { VISITOR_COUNTRY_HEADER, VISITOR_IP_HEADER } from "#src/modules/chat/visitor.ts";
import { serveAsset } from "#src/modules/pages/assets.client.ts";

// `request.cf` exists only on the edge request, so forward country and IP as
// headers. Delete before set so a client-sent value can't pass as ours.
function withVisitorHeaders(c: Context<AppEnv>, request: Request): Request {
  const { cf } = c.req.raw;
  const edgeCountry =
    cf && "country" in cf && typeof cf.country === "string" ? cf.country : undefined;
  const country = edgeCountry ?? c.req.header("CF-IPCountry");
  const ip = c.req.header("CF-Connecting-IP");

  const headers = new Headers(request.headers);
  headers.delete(VISITOR_COUNTRY_HEADER);
  headers.delete(VISITOR_IP_HEADER);
  if (country) headers.set(VISITOR_COUNTRY_HEADER, country);
  if (ip) headers.set(VISITOR_IP_HEADER, ip);
  return new Request(request, { headers });
}

async function chatRoom(c: Context<AppEnv>): Promise<Response> {
  const response = await routeAgentRequest(c.req.raw, c.env, {
    onBeforeConnect: request => withVisitorHeaders(c, request)
  });
  return response ?? serveAsset(c);
}

/**
 * Only the chat room's socket and the history its widget loads, at /agents/chat-room.
 * routeAgentRequest alone would expose every Durable Object, RateLimiter included.
 */
export const chatController = new Hono<AppEnv>();

chatController.get("/:room", c =>
  c.req.header("Upgrade") === "websocket" ? chatRoom(c) : serveAsset(c)
);
chatController.get("/:room/get-messages", chatRoom);
