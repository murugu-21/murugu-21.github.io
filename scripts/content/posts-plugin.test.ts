import { describe, expect, it } from "vitest";

import { parsePost } from "./posts-plugin.ts";

describe("parsePost", () => {
  it("validates the frontmatter and splits off the body the way Astro does", () => {
    const markdown = [
      "---",
      "title: Hello",
      'date: "2024-02-03T10:00:00.000Z"',
      'tags: ["backend"]',
      "---",
      "",
      "Body **text**.",
      ""
    ].join("\n");

    expect(parsePost({ slug: "hello", markdown })).toEqual({
      slug: "hello",
      data: {
        title: "Hello",
        date: new Date("2024-02-03T10:00:00.000Z"),
        tags: ["backend"],
        keywords: [],
        featured: false
      },
      body: "\n\nBody **text**.\n",
      markdown
    });
  });

  it("rejects a post without frontmatter or with a tag outside the vocabulary", () => {
    expect(() => parsePost({ slug: "bare", markdown: "# Just a heading\n" })).toThrow(
      "content/blog/bare/index.md has no frontmatter"
    );
    expect(() =>
      parsePost({
        slug: "vendor",
        markdown: '---\ntitle: T\ndate: "2024-01-01"\ntags: ["kubernetes"]\n---\nBody\n'
      })
    ).toThrow(/tags/);
  });
});
