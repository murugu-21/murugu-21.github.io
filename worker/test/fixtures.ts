// Shared fixtures for the Worker tests: one description of what the deployed build
// looks like, so the API and MCP surfaces are exercised against the same content
// instead of drifting fixtures, plus the chat room socket helpers.
import { env } from "cloudflare:workers";
import { assert, expect, vi } from "vitest";
import { z } from "zod";

import type { Dataset } from "#contracts/api/dataset.ts";
import type { PostSummary } from "#contracts/api/posts.ts";
import type { ChatRoom } from "#worker/chat-room.ts";
import worker from "#worker/server.ts";

// What the site build prerenders to /api/dataset.json (src/lib/dataset.ts builds it).
export const DATASET: Dataset = {
  person: {
    name: "Murugappan M",
    headline: "Full Stack Engineer",
    pitch: "I build B2B SaaS that ships in regulated industries.",
    location: "Bangalore, India",
    email: "murugu2001@example.com",
    site: "https://murugappan.dev/",
    availableForWork: true,
    currentRole: {
      role: "Software Engineer II",
      company: "MedMe Health",
      since: "2025-12"
    },
    focus: ["Build TypeScript"]
  },
  links: [
    {
      label: "Website",
      url: "https://murugappan.dev/"
    },
    {
      label: "About (canonical entity page)",
      url: "https://murugappan.dev/about/"
    },
    {
      label: "Blog",
      url: "https://murugappan.dev/blog/"
    },
    {
      label: "Blog RSS",
      url: "https://murugappan.dev/blog/rss.xml"
    },
    {
      label: "Resume (PDF)",
      url: "https://murugappan.dev/resume.pdf"
    },
    {
      label: "GitHub",
      url: "https://github.example/m"
    },
    {
      label: "LinkedIn",
      url: "https://linkedin.example/m"
    },
    {
      label: "X / Twitter",
      url: "https://x.example/m"
    },
    {
      label: "Email",
      url: "mailto:murugu2001@example.com"
    },
    {
      label: "Developer portal",
      url: "https://murugappan.dev/developers/"
    },
    {
      label: "OpenAPI spec",
      url: "https://murugappan.dev/openapi.json"
    },
    {
      label: "llms.txt",
      url: "https://murugappan.dev/llms.txt"
    },
    {
      label: "Agent instructions",
      url: "https://murugappan.dev/AGENTS.md"
    }
  ],
  experience: [
    {
      role: "Software Engineer II",
      company: "MedMe Health",
      location: "Canada (remote)",
      period: "December 2025 – Present",
      startDate: "2025-12",
      endDate: null,
      current: true,
      summary: "Event-driven RPA platform.",
      highlights: ["Lifted extraction accuracy to 95%+."]
    }
  ],
  skills: [
    {
      category: "Languages",
      skills: ["TypeScript", "Python"]
    }
  ],
  proficiencies: [
    {
      area: "Backend",
      tools: ["Node.js"],
      level: 90
    }
  ],
  education: [
    {
      institution: "Kumaraguru College of Technology",
      credential: "B.E. Computer Science",
      location: "Coimbatore, India",
      period: "June 2019 - April 2023",
      startDate: "2019-06",
      endDate: "2023-04",
      grade: null,
      highlights: ["Distributed systems."]
    }
  ],
  openSource: [
    {
      project: "AnkiDroid",
      role: "Open Source Contributor",
      description: "3 merged pull requests.",
      links: [
        {
          label: "Image paste",
          url: "https://gh.example/1"
        }
      ]
    }
  ]
};

export const LLMS_TXT = `# Murugappan M

> Pitch.

## Blog posts
- [Modern distributed rate limiting in the cloud](https://murugappan.dev/blog/cloud-agnostic-rate-limiting/): Why LLM agents make per-user rate limiting essential.
- [Coin Change Problem](https://murugappan.dev/blog/coin-change-problem/): Find minimum number of coins.
`;

// What the site build prerenders to /api/posts.json, the same posts LLMS_TXT lists.
const POSTS: PostSummary[] = [
  {
    slug: "cloud-agnostic-rate-limiting",
    title: "Modern distributed rate limiting in the cloud",
    url: "https://murugappan.dev/blog/cloud-agnostic-rate-limiting/",
    description: "Why LLM agents make per-user rate limiting essential."
  },
  {
    slug: "coin-change-problem",
    title: "Coin Change Problem",
    url: "https://murugappan.dev/blog/coin-change-problem/",
    description: "Find minimum number of coins."
  }
];

export const POST_MARKDOWN = "---\ntitle: Coin Change Problem\n---\n\nBody text.\n";

export const LLMS_FULL_TXT = "# SDE Journey\n\nEvery post, in full.\n";

export const AGENTS_MD = "# AGENTS.md — murugappan.dev\n\nWhen to use.\n";

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
    "/api/dataset.json": JSON.stringify(DATASET),
    "/api/posts.json": JSON.stringify(POSTS),
    "/llms.txt": LLMS_TXT,
    "/blog/coin-change-problem/index.md": POST_MARKDOWN,
    "/blog/llms-full.txt": LLMS_FULL_TXT,
    "/AGENTS.md": AGENTS_MD,
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

/** The pool's env plus the bindings worker/test/wrangler.jsonc leaves out. */
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
