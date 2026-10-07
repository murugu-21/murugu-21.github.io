import { describe, expect, it, vi } from "vitest";

import {
  blogIndexMarkdown,
  markdownResponse,
  postLines,
  siteLlmsText,
  textResponse
} from "#src/lib/llms.ts";
import { blogPost, setPosts } from "./test-posts";

vi.mock("astro:content", async () => (await import("./test-posts")).astroContentMock);

const POSTS = [
  blogPost({ id: "old", title: "Old post", date: "2023-01-01", description: "Plain summary" }),
  blogPost({
    id: "new",
    title: "New post",
    date: "2024-01-01",
    description: "Spans\n  two lines "
  }),
  blogPost({ id: "bare", title: "Bare", date: "2022-01-01" })
];

const OLD_LINE = "- [Old post](https://murugappan.dev/blog/old/): Plain summary";

describe("llms text", () => {
  it("lists posts newest first, one line each, with the description when there is one", async () => {
    setPosts(POSTS);
    expect(await postLines()).toEqual([
      "- [New post](https://murugappan.dev/blog/new/): Spans two lines",
      OLD_LINE,
      "- [Bare](https://murugappan.dev/blog/bare/)"
    ]);
  });

  it("puts the blog index under the blog's title and description", async () => {
    setPosts(POSTS.slice(0, 1));
    expect(await blogIndexMarkdown()).toBe(
      `# SDE Journey\n\n> A Technical blog on my experiences in the tech industry\n\n## Posts\n${OLD_LINE}\n`
    );
  });

  it("appends the post list to the site summary", async () => {
    setPosts(POSTS.slice(0, 1));
    const text = await siteLlmsText();
    expect(text.startsWith("# Murugappan M, Full Stack Engineer\n")).toBe(true);
    expect(text.endsWith(`\n\n## Blog posts\n${OLD_LINE}\n`)).toBe(true);
  });

  it("serves plain text and markdown with their content types", () => {
    expect(textResponse("a").headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(markdownResponse("a").headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
  });
});
