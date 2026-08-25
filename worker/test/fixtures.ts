// Shared site fixture for the API and MCP tests: one description of what the
// deployed build looks like, so the two surfaces are exercised against the
// same content instead of drifting fixtures.
import {buildDataset, type DatasetInput} from "../api/dataset";

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
  skillsSection: {subTitle: "FULL-STACK", skills: ["⚡ Build TypeScript"]},
  skillsCategories: [{category: "Languages", items: "TypeScript, Python"}],
  techStack: {experience: [{stack: "Backend", progressPercentage: "90%"}]},
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
    footerLink: [{name: "Image paste", url: "https://gh.example/1"}]
  },
  isHireable: true
};

export const LLMS_TXT = `# Murugappan M

> Pitch.

## Blog posts
- [Modern distributed rate limiting in the cloud](https://murugappan.dev/blog/cloud-agnostic-rate-limiting/): Why LLM agents make per-user rate limiting essential.
- [Coin Change Problem](https://murugappan.dev/blog/coin-change-problem/): Find minimum number of coins.
`;

export const POST_MARKDOWN =
  "---\ntitle: Coin Change Problem\n---\n\nBody text.\n";

export const LLMS_FULL_TXT = "# SDE Journey\n\nEvery post, in full.\n";

export const AGENTS_MD = "# AGENTS.md — murugappan.dev\n\nWhen to use.\n";

/** The styled 404 page the assets layer answers a miss with. */
export const NOT_FOUND_HTML = "<!doctype html><h1>404</h1>";

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
    ...overrides
  };
}

/** The real ASSETS binding takes a string, a URL or a Request — so does this. */
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
      // A miss is the styled 404 page, which is what the real binding returns
      // under assets.not_found_handling: "404-page" (see wrangler.jsonc).
      return Promise.resolve(
        body == null
          ? new Response(NOT_FOUND_HTML, {
              status: 404,
              headers: {"Content-Type": "text/html; charset=utf-8"}
            })
          : new Response(body, {
              status: 200,
              headers: path.endsWith(".html")
                ? {"Content-Type": "text/html; charset=utf-8"}
                : undefined
            })
      );
    }
  };
}
