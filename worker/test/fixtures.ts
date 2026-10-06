// Shared site fixture for the API and MCP tests: one description of what the
// deployed build looks like, so the two surfaces are exercised against the
// same content instead of drifting fixtures.
import { env } from "cloudflare:test";
import { assert, expect, vi } from "vitest";
import { z } from "zod";

import { buildDataset, type DatasetInput } from "#worker/api/dataset.ts";
import type { ChatRoom } from "#worker/chat-room.ts";
import worker from "#worker/server.ts";

export const DATASET_INPUT: DatasetInput = {
  greeting: {
    username: "Murugappan M",
    subTitle: "I build B2B SaaS that ships in regulated industries.",
    resumePath: "/resume.pdf"
  },
  resumeContact: {
    name: "Murugappan M",
    title: "Full Stack Engineer",
    location: "Bangalore, India",
    email: "murugu2001@example.com",
    site: "https://murugappan.dev",
    linkedin: "https://linkedin.example/m",
    github: "https://github.example/m"
  },
  socialMediaLinks: {
    github: "https://github.example/m",
    linkedin: "https://linkedin.example/m",
    gmail: "murugu2001@example.com",
    twitter: "https://x.example/m",
    rss: "https://murugappan.dev/blog/rss.xml"
  },
  workExperiences: [
    {
      role: "Software Engineer II",
      company: "MedMe Health",
      location: "Canada (remote)",
      date: "December 2025 – Present",
      desc: "Event-driven RPA platform.",
      descBullets: ["Lifted extraction accuracy to 95%+."]
    }
  ],
  skillsSection: { subTitle: "FULL-STACK", skills: ["⚡ Build TypeScript"] },
  skillsCategories: [{ category: "Languages", items: "TypeScript, Python" }],
  techStack: {
    experience: [{ stack: "Backend", tools: ["Node.js"], progressPercentage: "90%" }]
  },
  educationInfo: [
    {
      schoolName: "Kumaraguru College of Technology",
      subHeader: "B.E. Computer Science",
      duration: "June 2019 - April 2023",
      desc: "Coimbatore, India.",
      descBullets: ["Distributed systems."]
    }
  ],
  openSourceCard: {
    title: "AnkiDroid — Open Source Contributor",
    subtitle: "3 merged pull requests.",
    footerLink: [{ name: "Image paste", url: "https://gh.example/1" }]
  },
  isHireable: true
};

export const LLMS_TXT = `# Murugappan M

> Pitch.

## Blog posts
- [Modern distributed rate limiting in the cloud](https://murugappan.dev/blog/cloud-agnostic-rate-limiting/): Why LLM agents make per-user rate limiting essential.
- [Coin Change Problem](https://murugappan.dev/blog/coin-change-problem/): Find minimum number of coins.
`;

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
export function siteFiles(
  overrides: Record<string, string | null> = {}
): Record<string, string | null> {
  return {
    "/api/dataset.json": JSON.stringify(buildDataset(DATASET_INPUT)),
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
    // assets.notFoundHandling: "none" (see cloudflare.config.ts).
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

/** The visitor_* rows a ChatRoom keeps in its meta table. */
export function visitorMeta(instance: ChatRoom): Record<string, unknown> {
  return Object.fromEntries(
    instance.ctx.storage.sql
      .exec<{ key: string; value: SqlStorageValue }>(
        `SELECT key, value FROM meta WHERE key LIKE 'visitor_%'`
      )
      .toArray()
      .map(r => [r.key, r.value])
  );
}

/** The pool's env plus the bindings the test cf config leaves out. */
export function testEnv(options: TestEnvOptions = {}): Env {
  return {
    ...env,
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
