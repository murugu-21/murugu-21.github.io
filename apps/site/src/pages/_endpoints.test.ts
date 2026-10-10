import { afterEach, assert, describe, expect, it, vi } from "vitest";

import { blogPost, setPosts } from "#src/lib/blog/fixtures.ts";
import { GET as aboutMarkdown } from "./about/index.md.ts";
import { GET as blogLlmsFull } from "./blog/llms-full.txt.ts";
import { GET as blogLlms } from "./blog/llms.txt.ts";
import { GET as blogIndexMarkdown } from "./blog/index.md.ts";
import { GET as rss } from "./blog/rss.xml.ts";
import {
  GET as postMarkdown,
  getStaticPaths as postMarkdownPaths
} from "./blog/[slug]/index.md.ts";
import { GET as homeMarkdown } from "./index.md.ts";
import { GET as siteLlms } from "./llms.txt.ts";
import { GET as resumeMarkdown } from "./resume/index.md.ts";

vi.mock("astro:content", async () => (await import("#src/lib/blog/fixtures.ts")).astroContentMock);

const buildEnv = vi.hoisted(
  (): {
    GITHUB_TOKEN: string;
    REQUIRE_GITHUB_PROFILE: string;
    RESUME_PHONE: string | undefined;
  } => ({
    GITHUB_TOKEN: "tok",
    REQUIRE_GITHUB_PROFILE: "0",
    RESUME_PHONE: undefined
  })
);
vi.mock("astro:env/server", () => buildEnv);

afterEach(() => {
  vi.unstubAllGlobals();
  buildEnv.RESUME_PHONE = undefined;
});

const COIN_CHANGE_LINE =
  "- [Coin Change Problem](https://murugappan.dev/blog/coin-change-problem/): Find minimum number of coins that make a given value.";

describe("markdown renditions of the site", () => {
  it("serve the same summary at /llms.txt and /index.md", async () => {
    const llms = siteLlms();
    const home = homeMarkdown();

    expect(llms.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(home.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    const text = await llms.text();
    expect(text).toMatch(/^# Murugappan M, Full Stack Engineer\n\n> I build B2B SaaS /);
    expect(text).toContain(
      "\n## Open source\n\n### Vite\n\nA merged fix to Vite (83k+ GitHub stars)"
    );
    expect(text).toContain(
      "\n- [URL source roots (#23519)](https://github.com/vitejs/vite/pull/23519)\n"
    );
    expect(text).toContain(`\n## Blog posts\n`);
    expect(text).toContain(`\n${COIN_CHANGE_LINE}\n`);
    expect(text).not.toContain("js-closure");
    expect(await home.text()).toBe(text);
  });

  it("render the about page at /about/index.md, with absolute links", async () => {
    const res = aboutMarkdown();
    const text = await res.text();

    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(text).toMatch(/^# About Murugappan M\n\nI build B2B SaaS /);
    expect(text).toContain("\n- [Blog](https://murugappan.dev/blog/)\n");
    expect(text).toContain(
      "\n### HyperVerge\n\nAugust 2022 – December 2025 · Bangalore (onsite)\n\n#### SDE 2\n\nApril 2025 – December 2025\n"
    );
    expect(text).toContain("\n- **Languages:** TypeScript, Python, SQL, Bash, YAML\n");
  });

  it("render the resume at /resume/index.md, with the phone only when it is set", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ data: { user: null } }));
    const contactLine = async () => (await (await resumeMarkdown()).text()).split("\n")[4];

    const res = await resumeMarkdown();
    const text = await res.text();
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(text).toMatch(/^# Murugappan M\n\nFull Stack Engineer\n\nBangalore, India \| /);
    expect(text).toContain("\n### MedMe Health\n\nDecember 2025 – Present · Toronto (remote)\n");
    expect(text).toContain(
      "\n## Open Source\n\n### Vite\n\n[github.com/vitejs/vite/pull/23519](https://github.com/vitejs/vite/pull/23519)\n\nA merged fix"
    );
    expect(text).toContain(
      "\n### AnkiDroid\n\n[github.com/ankidroid/Anki-Android/pulls?q=is%3Apr+author%3Amurugu-21]"
    );
    expect(text).toContain("\n- **Languages:** TypeScript, Python, SQL, Bash, YAML\n");
    expect(await contactLine()).toBe(
      "Bangalore, India | [murugu2001@gmail.com](mailto:murugu2001@gmail.com) | [www.linkedin.com/in/murugappan-m-56920a192](https://www.linkedin.com/in/murugappan-m-56920a192/) | [github.com/murugu-21](https://github.com/murugu-21) | [murugappan.dev](https://murugappan.dev)"
    );

    buildEnv.RESUME_PHONE = "+91 98765 43210";
    expect(await contactLine()).toMatch(
      /^Bangalore, India \| \+91 98765 43210 \| \[murugu2001@gmail\.com\]/
    );
  });

  it("list the pinned repos that have a description under the resume's Projects", async () => {
    const repo = {
      url: "https://github.com/murugu-21/x",
      forkCount: 0,
      diskUsage: 1,
      primaryLanguage: null,
      stargazers: { totalCount: 0 }
    };
    vi.stubGlobal("fetch", async () =>
      Response.json({
        data: {
          user: {
            pinnedItems: {
              edges: [
                {
                  node: {
                    ...repo,
                    name: "portfolio",
                    description: "This site.",
                    homepageUrl: "https://murugappan.dev/"
                  }
                },
                { node: { ...repo, name: "undescribed", description: null, homepageUrl: null } }
              ]
            }
          }
        }
      })
    );

    expect(await (await resumeMarkdown()).text()).toContain(
      "\n## Projects\n\n### portfolio\n\n[murugappan.dev](https://murugappan.dev/)\n\nThis site.\n\n## Open Source\n"
    );
  });

  it("lists the posts at /blog/index.md and /blog/llms.txt", async () => {
    const index = await blogIndexMarkdown().text();
    const llms = await blogLlms().text();

    expect(index).toMatch(
      /^# SDE Journey\n\n> A Technical blog on my experiences in the tech industry\n\n## Posts\n- \[/
    );
    expect(llms).toMatch(
      /^# SDE Journey\n\n> A Technical blog on my experiences in the tech industry, by Murugappan M\.\n\n## Posts\n\n- \[/
    );
    expect(index.endsWith(`${COIN_CHANGE_LINE}\n`)).toBe(true);
    expect(llms.endsWith(`${COIN_CHANGE_LINE}\n`)).toBe(true);
  });

  it("puts every post's body, dated and described, in /blog/llms-full.txt", async () => {
    const text = await blogLlmsFull().text();

    expect(text).toMatch(/^# SDE Journey: full content\n/);
    expect(text).toContain(
      [
        "# Coin Change Problem",
        "URL: https://murugappan.dev/blog/coin-change-problem/",
        "Date: 2021-08-09",
        "Description: Find minimum number of coins that make a given value.",
        "",
        "When I was a child, I used to run to grocery store nearby"
      ].join("\n")
    );
    expect(text).not.toContain("js-closure");
  });
});

describe("post markdown routes", () => {
  it("serve each published post's source with its frontmatter, and no drafts", async () => {
    const routes = postMarkdownPaths();
    const slugs = routes.map(route => route.params.slug);
    expect(slugs).toContain("coin-change-problem");
    expect(slugs.filter(slug => slug.includes("js-closure"))).toEqual([]);

    const coinChange = routes.find(route => route.params.slug === "coin-change-problem");
    assert(coinChange, "coin-change-problem has no markdown route");
    const res = postMarkdown({ props: coinChange.props });
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(await res.text()).toMatch(
      /^---\ntitle: Coin Change Problem\ndate: "2021-08-09T23:46:37\.121Z"\n[\s\S]*\n---\n\nWhen I was a child/
    );
  });
});

const itemHtml = (xml: string) =>
  (/<content:encoded>([\s\S]*?)<\/content:encoded>/.exec(xml)?.[1] ?? "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");

describe("/blog/rss.xml", () => {
  it("serves each post's HTML with absolute image URLs, inline HTML kept and scripts dropped", async () => {
    setPosts([
      blogPost({
        id: "429-googleapis",
        title: "Quota",
        date: "2024-05-06",
        description: "Hitting 429s",
        body: [
          "![quota](./quota.png) ![logo](/brand/logo.png) ![remote](https://cdn.example/x.png) ![gone](missing.png)",
          "In my 3<sup>rd</sup> year.",
          "<script>alert(1)</script>"
        ].join("\n\n")
      })
    ]);

    const xml = await (await rss()).text();

    expect(xml).toContain(
      "<item><title>Quota</title><link>https://murugappan.dev/blog/429-googleapis/</link>"
    );
    expect(xml).toContain("<pubDate>Mon, 06 May 2024 00:00:00 GMT</pubDate>");
    expect(itemHtml(xml)).toBe(
      '<p><img src="https://murugappan.dev/packages/content/blog/429-googleapis/quota.png" alt="quota" /> ' +
        '<img src="/brand/logo.png" alt="logo" /> <img src="https://cdn.example/x.png" alt="remote" /> ' +
        '<img src="missing.png" alt="gone" /></p>\n<p>In my 3<sup>rd</sup> year.</p>\n'
    );
  });
});
