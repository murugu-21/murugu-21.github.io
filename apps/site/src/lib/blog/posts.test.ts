import { afterEach, describe, expect, it, vi } from "vitest";

import { postSource } from "@murugappan/content/fixtures.ts";
import {
  formatDate,
  formatReadingTime,
  getPublishedPosts,
  postKeywords,
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

describe("tagPath", () => {
  it("builds the tag-filter link", () => {
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
    const post = postSource({ slug: "p", tags: ["ai", "backend"], keywords: ["rate limiting"] });
    expect(postKeywords(post)).toEqual(["ai", "backend", "rate limiting"]);
  });
});

describe("reading time", () => {
  it("is whole minutes, never below one", () => {
    expect(timeToRead("")).toBe(1);
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
