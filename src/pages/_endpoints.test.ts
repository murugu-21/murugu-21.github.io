import { assert, describe, expect, it, vi } from "vitest";

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

vi.mock("astro:content", async () => (await import("#src/lib/blog/fixtures.ts")).astroContentMock);

const COIN_CHANGE_LINE =
  "- [Coin Change Problem](https://murugappan.dev/blog/coin-change-problem/): Find minimum number of coins that make a given value.";

describe("markdown renditions of the site", () => {
  it("serve the same summary at /llms.txt, /index.md and /about/index.md", async () => {
    const llms = siteLlms();
    const home = homeMarkdown();
    const about = aboutMarkdown();

    expect(llms.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(home.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(about.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    const text = await llms.text();
    expect(text).toMatch(/^# Murugappan M, Full Stack Engineer\n/);
    expect(text).toContain(`\n## Blog posts\n`);
    expect(text).toContain(`\n${COIN_CHANGE_LINE}\n`);
    expect(text).not.toContain("js-closure");
    expect(await home.text()).toBe(text);
    expect(await about.text()).toBe(text);
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
      '<p><img src="https://murugappan.dev/content/blog/429-googleapis/quota.png" alt="quota" /> ' +
        '<img src="/brand/logo.png" alt="logo" /> <img src="https://cdn.example/x.png" alt="remote" /> ' +
        '<img src="missing.png" alt="gone" /></p>\n<p>In my 3<sup>rd</sup> year.</p>\n'
    );
  });
});
