import {describe, expect, it} from "vitest";

import {parsePostList, postMarkdownPath} from "../api/posts";

const LLMS = `# Murugappan M — Full Stack Engineer

> Full-stack engineer.

## Machine-readable feeds
- [Blog RSS](https://murugappan.dev/blog/rss.xml)
- [Full blog content for LLMs](https://murugappan.dev/blog/llms-full.txt)

## Blog posts
- [Why SiteGPT's chat runs on PartyKit](https://murugappan.dev/blog/sitegpt-partykit-durable-objects/): How one-process-per-room replaces socket.io + Redis.
- [Coin Change Problem](https://murugappan.dev/blog/coin-change-problem/): Find minimum number of coins.
`;

describe("parsePostList", () => {
  it("reads title, slug, url and description from the blog posts section", () => {
    expect(parsePostList(LLMS)).toEqual([
      {
        slug: "sitegpt-partykit-durable-objects",
        title: "Why SiteGPT's chat runs on PartyKit",
        url: "https://murugappan.dev/blog/sitegpt-partykit-durable-objects/",
        description: "How one-process-per-room replaces socket.io + Redis."
      },
      {
        slug: "coin-change-problem",
        title: "Coin Change Problem",
        url: "https://murugappan.dev/blog/coin-change-problem/",
        description: "Find minimum number of coins."
      }
    ]);
  });

  it("ignores feed links that are not post pages", () => {
    expect(parsePostList(LLMS).map(p => p.slug)).not.toContain("rss.xml");
  });

  it("falls back to scanning the whole document when the section heading is missing", () => {
    const withoutHeading = LLMS.replace("## Blog posts\n", "");
    expect(parsePostList(withoutHeading).map(p => p.slug)).toEqual([
      "sitegpt-partykit-durable-objects",
      "coin-change-problem"
    ]);
  });

  it("stops at the next section heading", () => {
    const withTrailer = `${LLMS}\n## Something else\n- [Nope](https://murugappan.dev/blog/nope/): no.\n`;
    expect(parsePostList(withTrailer).map(p => p.slug)).toEqual([
      "sitegpt-partykit-durable-objects",
      "coin-change-problem"
    ]);
  });

  it("tolerates a post line with no description", () => {
    const line = "## Blog posts\n- [Bare](https://murugappan.dev/blog/bare/)\n";
    expect(parsePostList(line)).toEqual([
      {
        slug: "bare",
        title: "Bare",
        url: "https://murugappan.dev/blog/bare/",
        description: ""
      }
    ]);
  });

  it("returns nothing for text with no post links", () => {
    expect(parsePostList("# Nothing here\n")).toEqual([]);
  });
});

describe("postMarkdownPath", () => {
  it("maps a slug to its built markdown rendition", () => {
    expect(postMarkdownPath("coin-change-problem")).toBe(
      "/blog/coin-change-problem/index.md"
    );
  });

  it("rejects a slug that is not a plain kebab-case token", () => {
    expect(postMarkdownPath("../secrets")).toBeNull();
    expect(postMarkdownPath("Mixed_Case")).toBeNull();
    expect(postMarkdownPath("")).toBeNull();
  });
});
