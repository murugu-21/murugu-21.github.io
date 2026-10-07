import { afterEach, describe, expect, it, vi } from "vitest";

import {
  excerpt,
  formatDate,
  formatReadingTime,
  getPublishedPosts,
  postDescription,
  postKeywords,
  postPath,
  postUrl,
  tagPath,
  timeToRead
} from "./posts";
import { blogPost, setPosts } from "./fixtures";

vi.mock("astro:content", async () => (await import("./fixtures")).astroContentMock);

afterEach(() => vi.unstubAllEnvs());

describe("getPublishedPosts", () => {
  const older = blogPost({ id: "older", date: "2023-03-01" });
  const newer = blogPost({ id: "newer", date: "2024-06-01" });
  const draft = blogPost({ id: "draft/wip", date: "2025-01-01" });

  it("lists posts newest first", async () => {
    setPosts([older, newer]);
    expect((await getPublishedPosts()).map(p => p.id)).toEqual(["newer", "older"]);
  });

  it("keeps drafts in development and drops them in production", async () => {
    setPosts([older, draft]);
    vi.stubEnv("PROD", false);
    expect((await getPublishedPosts()).map(p => p.id)).toEqual(["draft/wip", "older"]);

    vi.stubEnv("PROD", true);
    expect((await getPublishedPosts()).map(p => p.id)).toEqual(["older"]);
  });
});

describe("post URLs", () => {
  it("builds the page path, absolute URL and tag-filter link", () => {
    expect(postPath("hello-world")).toBe("/blog/hello-world/");
    expect(postUrl("hello-world")).toBe("https://murugappan.dev/blog/hello-world/");
    expect(tagPath("system-design")).toBe("/blog/?tag=system-design");
  });
});

describe("formatDate", () => {
  it("writes a zero-padded long date in UTC", () => {
    expect(formatDate(new Date("2021-08-09T23:30:00Z"))).toBe("August 09, 2021");
  });
});

describe("postKeywords", () => {
  it("joins tags and keywords into one vocabulary", () => {
    const post = blogPost({ id: "p", tags: ["ai", "backend"], keywords: ["rate limiting"] });
    expect(postKeywords(post)).toEqual(["ai", "backend", "rate limiting"]);
  });
});

describe("reading time", () => {
  it("is whole minutes, never below one", () => {
    expect(timeToRead(undefined)).toBe(1);
    expect(timeToRead("word ".repeat(450))).toBe(3);
  });

  it.each([
    [1, "☕️ 1 min read"],
    [10, "☕️☕️ 10 min read"],
    [30, "🍱🍱 30 min read"]
  ])("shows %i minutes as %s", (minutes, label) => {
    expect(formatReadingTime(minutes)).toBe(label);
  });
});

describe("excerpt", () => {
  it("drops code fences, images and markup, and keeps link text", () => {
    const body =
      "# Title\n\n![alt](a.png) Read [the docs](https://x.dev) *now*.\n\n```js\nboom()\n```\nDone.";
    expect(excerpt(body)).toBe("Title Read the docs now. Done.");
  });

  it("keeps underscores inside words and drops emphasis underscores", () => {
    expect(excerpt("Set __event_type__ on _each_ café_au_lait row.")).toBe(
      "Set event_type on each café_au_lait row."
    );
  });

  it("cuts at a word boundary and adds an ellipsis when too long", () => {
    expect(excerpt("alpha beta gamma delta", 12)).toBe("alpha beta…");
  });

  it("is empty for a missing body", () => {
    expect(excerpt(undefined)).toBe("");
  });
});

describe("postDescription", () => {
  it("prefers the frontmatter description over the body excerpt", () => {
    expect(postDescription(blogPost({ id: "a", description: "Written", body: "Body text" }))).toBe(
      "Written"
    );
    expect(postDescription(blogPost({ id: "b", body: "Body **text**" }))).toBe("Body text");
  });
});
