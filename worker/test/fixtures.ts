// Shared site fixture for the API and MCP tests: one description of what the
// deployed build looks like, so the two surfaces are exercised against the
// same content instead of drifting fixtures.
import { env } from "cloudflare:test";

import { buildDataset, type DatasetInput } from "../api/dataset";
import type { ChatRoom } from "../chat-room";
import type { EmailLike } from "../email";

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

/** The site's styled 404 page (dist/client/404.html). */
export const NOT_FOUND_HTML = "<!doctype html><h1>404</h1>";

/** The blog's styled 404 page (dist/client/blog/404/index.html). */
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

export function fakeAssets(overrides: Record<string, string | null> = {}) {
  const files = siteFiles(overrides);
  return {
    fetch: (input: RequestInfo | URL) => {
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
    }
  };
}

export type TestEnvOptions = {
  assets?: Record<string, string | null>;
  /** null unsets the binding. */
  inbox?: string | null;
  /** null unsets the binding. */
  email?: EmailLike | null;
};

type SentEmail = Parameters<EmailLike["send"]>[0];

/** An EMAIL binding that records every message instead of sending it. */
export function recordingEmail(): { email: EmailLike; sent: SentEmail[] } {
  const sent: SentEmail[] = [];
  return { email: { send: async msg => void sent.push(msg) }, sent };
}

/** The visitor_* rows a ChatRoom keeps in its meta table. */
export function visitorMeta(instance: ChatRoom): Record<string, unknown> {
  return Object.fromEntries(
    instance.ctx.storage.sql
      .exec(`SELECT key, value FROM meta WHERE key LIKE 'visitor_%'`)
      .toArray()
      .map(r => [String(r.key), r.value])
  );
}

/** The pool's env plus the bindings the test wrangler config leaves out. */
export function testEnv(options: TestEnvOptions = {}): Env {
  return {
    ...env,
    ASSETS: fakeAssets(options.assets),
    OPPORTUNITY_INBOX: options.inbox === undefined ? "inbox@example.com" : options.inbox,
    EMAIL: options.email === undefined ? { send: () => Promise.resolve() } : options.email
  } as unknown as Env;
}
