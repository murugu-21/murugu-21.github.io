import { describe, expect, it } from "vitest";

import { postSource } from "./fixtures.ts";
import { excerpt, postDescription, postPath, postUrl } from "./posts.ts";

describe("post URLs", () => {
  it("builds the page path and absolute URL", () => {
    expect(postPath("hello-world")).toBe("/blog/hello-world/");
    expect(postUrl("hello-world")).toBe("https://murugappan.dev/blog/hello-world/");
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
});

describe("postDescription", () => {
  it("prefers the frontmatter description over the body excerpt", () => {
    expect(
      postDescription(postSource({ slug: "a", description: "Written", body: "Body text" }))
    ).toBe("Written");
    expect(postDescription(postSource({ slug: "b", body: "Body **text**" }))).toBe("Body text");
  });
});
