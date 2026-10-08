// Node project: sanitize-html's postcss dependency doesn't load in the Workers pool.
import { describe, expect, it, vi } from "vitest";

import { blogPost, setPosts } from "#src/lib/blog/fixtures.ts";
import { GET as rss } from "./rss.xml.ts";

vi.mock("astro:content", async () => (await import("#src/lib/blog/fixtures.ts")).astroContentMock);

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
