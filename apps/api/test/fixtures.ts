// Shared fixtures for the Worker tests: the built pages the ASSETS binding serves, the bindings
// the pool leaves out, and the chat room socket helpers. Site content comes from the real sources,
// bundled through virtual:content/posts as in production.
import { env } from "cloudflare:workers";
import { assert, expect, vi } from "vitest";
import { z } from "zod";

import type { ChatRoom } from "#src/chat-room.ts";
import worker from "#src/server.ts";

/** The site's styled 404 page (404.html in the build). */
export const NOT_FOUND_HTML = "<!doctype html><h1>404</h1>";

/** The blog's styled 404 page (blog/404/index.html in the build). */
export const BLOG_NOT_FOUND_HTML = "<!doctype html><h1>SDE Journey: 404</h1>";

// Served as text/html, like the real binding does for .html files and the
// directory-index paths html_handling resolves to them.
const HTML_PATHS = new Set(["/404", "/blog/404/"]);

/** Overriding a path with null makes the assets binding 404 it. */
function siteFiles(overrides: Record<string, string | null> = {}): Record<string, string | null> {
  return {
    "/404": NOT_FOUND_HTML,
    "/blog/404/": BLOG_NOT_FOUND_HTML,
    ...overrides
  };
}

/** Accepts a string, URL or Request, like the real ASSETS binding. */
function assetPath(input: RequestInfo | URL): string {
  if (typeof input === "string") return new URL(input).pathname;
  if (input instanceof URL) return input.pathname;
  return new URL(input.url).pathname;
}

/** A Fetcher binding answering with `fetch`; no test opens a socket through one. */
export function fakeFetcher(fetch: (input: RequestInfo | URL) => Promise<Response>): Fetcher {
  return {
    fetch,
    connect: () => {
      throw new Error("fakeFetcher does not implement connect()");
    }
  };
}

export function fakeAssets(overrides: Record<string, string | null> = {}): Fetcher {
  const files = siteFiles(overrides);
  return fakeFetcher(input => {
    const path = assetPath(input);
    const body = files[path];
    // A miss is an empty 404, which is what the real binding returns under
    // assets.not_found_handling: "none" (see wrangler.jsonc).
    return Promise.resolve(
      body == null
        ? new Response(null, { status: 404 })
        : new Response(body, {
            status: 200,
            headers:
              path.endsWith(".html") || HTML_PATHS.has(path)
                ? { "Content-Type": "text/html; charset=utf-8" }
                : undefined
          })
    );
  });
}

export type TestEnvOptions = {
  assets?: Record<string, string | null>;
  /** "" leaves the inbox unconfigured. */
  inbox?: string;
  email?: SendEmail;
};

/** An EMAIL binding that records every message instead of sending it. */
export function recordingEmail(): { email: SendEmail; sent: EmailMessageBuilder[] } {
  const sent: EmailMessageBuilder[] = [];
  const send = async (message: EmailMessage | EmailMessageBuilder) => {
    // the worker only sends builders; a raw EmailMessage has no subject
    if (!("subject" in message)) throw new Error("recordingEmail only records message builders");
    sent.push(message);
    return { messageId: `test-${sent.length}` };
  };
  return { email: { send }, sent };
}

/** The visitor_* values a ChatRoom keeps in its storage. */
export function visitorStorage(instance: ChatRoom): Record<string, unknown> {
  return Object.fromEntries(instance.ctx.storage.kv.list({ prefix: "visitor_" }));
}

/** The pool's env plus the bindings apps/api/test/wrangler.jsonc leaves out. */
export function testEnv(options: TestEnvOptions = {}): Env {
  // Named rather than spread: `env` is typed as the full Env, so a binding added to
  // ../../wrangler.jsonc fails to type-check here until testEnv supplies it.
  const { AUDIO, CHAT_DB, ChatRoom, RateLimiter } = env;
  return {
    AUDIO,
    CHAT_DB,
    ChatRoom,
    RateLimiter,
    ASSETS: fakeAssets(options.assets),
    OPPORTUNITY_INBOX: options.inbox ?? "inbox@example.com",
    // Env requires it; empty means no key, as in local dev without the secret
    DEEPSEEK_API_KEY: "",
    EMAIL: options.email ?? recordingEmail().email
  };
}

/** A response's JSON body, checked against `schema`. */
export async function readJson<S extends z.ZodType>(res: Response, schema: S): Promise<z.infer<S>> {
  return schema.parse(await res.json());
}

export type FetchOptions = RequestInit & { ip?: string; env?: TestEnvOptions };

/** Sends a request through the worker entry; a bare path resolves against the site. */
export async function fetchWorker(
  path: string,
  { ip, env: envOptions, ...init }: FetchOptions = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (ip) headers.set("CF-Connecting-IP", ip);
  return worker.fetch(
    new Request(new URL(path, "https://murugappan.dev"), { ...init, headers }),
    testEnv(envOptions)
  );
}

/** A real WebSocket to a chat room through the worker, recording every frame it receives. */
export async function openRoom(room: string, headers: Record<string, string> = {}) {
  const response = await fetchWorker(`/agents/chat-room/${room}`, {
    headers: { Upgrade: "websocket", ...headers }
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

/** Connects to a room, waits for the agent to introduce itself, then hangs up. */
export async function connectRoom(room: string, headers: Record<string, string> = {}) {
  const { socket, frames, stub } = await openRoom(room, headers);
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

/** One request's response frames on a socket, once its terminal frame has arrived. */
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

export const noticesIn = (chunks: Chunk[]) =>
  chunks.filter(c => c.type === "data-notice").map(c => c.data);
