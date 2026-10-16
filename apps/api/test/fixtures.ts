import { env } from "cloudflare:workers";
import { Effect, Layer } from "effect";
import type { ClientResponse } from "hono/client";
import { testClient } from "hono/testing";
import { assert, expect, onTestFinished, vi } from "vite-plus/test";
import { z } from "zod";

import { SITE_ORIGIN } from "@murugappan/content/site.ts";
import type { JsonValue } from "@murugappan/utils/json.ts";
import { appLayer, type AppLayer } from "#src/app.module.ts";
import { createApp } from "#src/app.ts";
import type { ChatRoom } from "#src/modules/chat/chat-room.durable-object.ts";
import { ContactQuotaRepository } from "#src/modules/rate-limit/contact-quota.repository.ts";
import { globalLimiter } from "#src/modules/rate-limit/rate-limiter.client.ts";
import worker from "#src/server.ts";

export const NOT_FOUND_HTML = "<!doctype html><h1>404</h1>";

export const BLOG_NOT_FOUND_HTML = "<!doctype html><h1>SDE Journey: 404</h1>";

function assetPath(input: RequestInfo | URL): string {
  if (input instanceof URL) return input.pathname;
  if (input instanceof Request) return new URL(input.url).pathname;
  return new URL(input).pathname;
}

export function fakeFetcher(fetch: (input: RequestInfo | URL) => Promise<Response>): Fetcher {
  return {
    fetch,
    connect: () => {
      throw new Error("fakeFetcher does not implement connect()");
    }
  };
}

export function fakeAssets(overrides: Record<string, string | null> = {}): Fetcher {
  const files = new Map([
    ["/404", NOT_FOUND_HTML],
    ["/blog/404/", BLOG_NOT_FOUND_HTML],
    ...Object.entries(overrides)
  ]);
  return fakeFetcher(input => {
    const path = assetPath(input);
    const body = files.get(path);
    // A miss is an empty 404, which is what the real binding returns under
    // assets.not_found_handling: "none" (see wrangler.jsonc).
    if (body == null) return Promise.resolve(new Response(null, { status: 404 }));

    const etag = `"${path}"`;
    const ifNoneMatch = input instanceof Request ? input.headers.get("If-None-Match") : null;
    if (ifNoneMatch === etag)
      return Promise.resolve(new Response(null, { status: 304, headers: { ETag: etag } }));

    const headers = new Headers({ ETag: etag });
    // As the real binding does for .html files and the paths html_handling resolves to them.
    if (path === "/404" || path.endsWith("/") || path.endsWith(".html"))
      headers.set("Content-Type", "text/html; charset=utf-8");
    return Promise.resolve(new Response(body, { status: 200, headers }));
  });
}

export type TestEnvOptions = {
  assets?: Record<string, string | null>;
  inbox?: string;
  email?: SendEmail;
  posthogToken?: string;
};

type RecordingEmail = { email: SendEmail; sent: EmailMessageBuilder[] };

export function recordingEmail(): RecordingEmail {
  const sent: EmailMessageBuilder[] = [];
  const send = async (message: EmailMessage | EmailMessageBuilder) => {
    if (!("subject" in message)) throw new Error("recordingEmail only records message builders");
    sent.push(message);
    return { messageId: `test-${sent.length}` };
  };
  return { email: { send }, sent };
}

const VisitorStorage = z.object({
  visitor_country: z.string().optional(),
  visitor_ip: z.string().optional(),
  visitor_first_seen: z.number(),
  visitor_last_seen: z.number()
});

export function visitorStorage(instance: ChatRoom) {
  return VisitorStorage.parse(
    Object.fromEntries(instance.ctx.storage.kv.list({ prefix: "visitor_" }))
  );
}

export function testEnv(options: TestEnvOptions = {}): Env {
  // Named rather than spread: `env` is typed as the full Env, so a binding added to
  // ../wrangler.jsonc fails to type-check here until testEnv supplies it.
  const { AUDIO, CHAT_DB, ChatRoom, RateLimiter } = env;
  return {
    AUDIO,
    CHAT_DB,
    ChatRoom,
    RateLimiter,
    ASSETS: fakeAssets(options.assets),
    OPPORTUNITY_INBOX: options.inbox ?? "inbox@example.com",
    DEEPSEEK_API_KEY: "",
    EMAIL: options.email ?? recordingEmail().email,
    POSTHOG_PROJECT_TOKEN: options.posthogToken ?? ""
  };
}

export function capturedErrors() {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => spy.mockRestore());
  return spy;
}

export function fakeContactQuota(quota: Partial<ContactQuotaRepository["Service"]>): AppLayer {
  const unexpected = () => Effect.die(new Error("this test did not fake that quota call"));
  return appLayer(
    Layer.succeed(ContactQuotaRepository, { take: unexpected, usage: unexpected, ...quota })
  );
}

export function sharedLimiter() {
  onTestFinished(() => {
    vi.restoreAllMocks();
  });
  const limiter = globalLimiter(env);
  vi.spyOn(env.RateLimiter, "get").mockReturnValue(limiter);
  return limiter;
}

export function stubDeepseekBalance(body: JsonValue, status = 200): void {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status }));
}

export type JsonBody = Response | ClientResponse<unknown>;

export async function readJson<S extends z.ZodType>(res: JsonBody, schema: S): Promise<z.infer<S>> {
  return schema.parse(await res.json());
}

export type FetchOptions = RequestInit & {
  ip?: string;
  env?: TestEnvOptions;
  layer?: AppLayer;
  ctx?: ExecutionContext;
};

export async function fetchWorker(
  path: string,
  { ip, env: envOptions, layer, ctx, ...init }: FetchOptions = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (ip) headers.set("CF-Connecting-IP", ip);
  const app = layer ? createApp(layer) : worker;
  return app.fetch(
    new Request(new URL(path, SITE_ORIGIN), { ...init, headers }),
    testEnv(envOptions),
    ctx
  );
}

export function apiClient({
  ip,
  env: envOptions,
  layer
}: Pick<FetchOptions, "ip" | "env" | "layer"> = {}) {
  return testClient(
    createApp(layer),
    testEnv(envOptions),
    undefined,
    ip ? { headers: { "CF-Connecting-IP": ip } } : undefined
  );
}

export const roomName = (label: string) => label.padEnd(21, "-");

type RoomRequest = { headers?: Record<string, string>; cf?: RequestInit["cf"] };

export async function openRoom(room: string, { headers, cf }: RoomRequest = {}) {
  const response = await fetchWorker(`/agents/chat-room/${room}`, {
    headers: { Upgrade: "websocket", Origin: SITE_ORIGIN, ...headers },
    cf
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  assert(socket, "no WebSocket on the upgrade response");
  const frames: unknown[] = [];
  socket.addEventListener("message", e => {
    frames.push(JSON.parse(String(e.data)));
  });
  socket.accept();
  return { socket, frames, stub: env.ChatRoom.get(env.ChatRoom.idFromName(room)) };
}

export async function connectRoom(room: string, request: RoomRequest = {}) {
  const { socket, frames, stub } = await openRoom(room, request);
  await vi.waitFor(() => assert(frames.length >= 2, "the room sent nothing"), { timeout: 2000 });
  socket.close();
  return { stub };
}

const ResponseFrame = z.object({
  type: z.literal("cf_agent_use_chat_response"),
  id: z.string(),
  body: z.string(),
  done: z.boolean(),
  error: z.boolean().optional()
});
const Chunk = z.looseObject({
  type: z.string(),
  delta: z.string().optional(),
  data: z.unknown().optional()
});
export type Chunk = z.infer<typeof Chunk>;

export const userMessage = ({ id, text }: { id: string; text: string }) => ({
  id,
  role: "user",
  parts: [{ type: "text", text }]
});

export function chatRequest({
  id,
  messages,
  trigger = "submit-message",
  page
}: {
  id: string;
  messages: unknown[];
  trigger?: string;
  page?: string;
}): string {
  return JSON.stringify({
    type: "cf_agent_use_chat_request",
    id,
    init: { method: "POST", body: JSON.stringify({ messages, trigger, page }) }
  });
}

export function responseFrames(
  frames: unknown[],
  id: string,
  { timeout = 5000 }: { timeout?: number } = {}
) {
  return vi.waitFor(
    () => {
      const mine = frames.flatMap(f => {
        const frame = ResponseFrame.safeParse(f).data;
        return frame?.id === id ? [frame] : [];
      });
      assert(mine.at(-1)?.done, `no terminal frame for ${id} yet`);
      return mine;
    },
    { timeout, interval: 10 }
  );
}

export async function streamedChunks(
  frames: unknown[],
  id: string,
  options?: { timeout?: number }
): Promise<Chunk[]> {
  return (await responseFrames(frames, id, options)).flatMap(f =>
    f.body ? [Chunk.parse(JSON.parse(f.body))] : []
  );
}

export const replyText = (chunks: Chunk[]) =>
  chunks.flatMap(c => (c.type === "text-delta" && c.delta ? [c.delta] : [])).join("");

const dataOf = (type: string) => (chunks: Chunk[]) =>
  chunks.flatMap(c => (c.type === type ? [c.data] : []));

export const noticesIn = dataOf("data-notice");
export const activitiesIn = dataOf("data-activity");
