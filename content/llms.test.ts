import { describe, expect, it } from "vitest";

import { postSource } from "./fixtures.ts";
import { blogIndexMarkdown } from "./llms.ts";

describe("llms text", () => {
  it("lists posts newest first, one line each, with the description when there is one", () => {
    const posts = [
      postSource({
        slug: "old",
        title: "Old post",
        date: "2023-01-01",
        description: "Plain summary"
      }),
      postSource({
        slug: "new",
        title: "New post",
        date: "2024-01-01",
        description: "Spans\n  two lines "
      }),
      postSource({ slug: "bare", title: "Bare", date: "2022-01-01" })
    ];
    expect(blogIndexMarkdown(posts)).toBe(
      [
        "# SDE Journey",
        "",
        "> A Technical blog on my experiences in the tech industry",
        "",
        "## Posts",
        "- [New post](https://murugappan.dev/blog/new/): Spans two lines",
        "- [Old post](https://murugappan.dev/blog/old/): Plain summary",
        "- [Bare](https://murugappan.dev/blog/bare/)",
        ""
      ].join("\n")
    );
  });
});
