import { routeAgentRequest } from "agents";
import { Hono, type Context } from "hono";
import { z } from "zod";

import type { AppEnv } from "#src/common/app-env.ts";
import { siteOriginGuard } from "#src/modules/chat/site-origin.guard.ts";
import { turnstileGuard } from "#src/modules/chat/turnstile.guard.ts";
import { VISITOR_COUNTRY_HEADER, VISITOR_IP_HEADER } from "#src/modules/chat/visitor.ts";
import { serveAsset } from "#src/modules/pages/assets.client.ts";

const EdgeLocation = z.object({ country: z.string() });

// `request.cf` exists only on the edge request, so forward country and IP as
// headers. Delete before set so a client-sent value can't pass as ours.
function withVisitorHeaders(c: Context<AppEnv>, request: Request): Request {
  const edgeCountry = EdgeLocation.safeParse(c.req.raw.cf).data?.country;
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
  // oxlint-disable-next-line no-restricted-properties -- the agents SDK's router needs the bindings to reach ChatRoom (apps/api/README.md › Layers)
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

const ROOM = "/:room{[\\w-]{21}}";

chatController.get(ROOM, siteOriginGuard, turnstileGuard, c =>
  c.req.header("Upgrade") === "websocket" ? chatRoom(c) : serveAsset(c)
);
// The room accepts an upgrade on any sub-path, so this one must refuse it or skip both guards.
chatController.get(`${ROOM}/get-messages`, c =>
  c.req.header("Upgrade") ? c.notFound() : chatRoom(c)
);
