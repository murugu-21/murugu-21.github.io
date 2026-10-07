// The parsers behind the read and write endpoints: the prerendered dataset,
// the post list read from llms.txt and the contact form body.
import { describe, expect, it } from "vitest";

import { CONTACT_LIMITS } from "#contracts/api/contact.ts";
import { parseContactRequest } from "#worker/api/contact.ts";
import { loadDataset, parseDataset } from "#worker/api/store.ts";
import { parsePostList, postMarkdownPath } from "#worker/api/posts.ts";
import { DATASET, fakeAssets, fakeFetcher } from "./fixtures";

describe("parseDataset", () => {
  it("accepts the built dataset and rejects one missing a collection", () => {
    expect(parseDataset(JSON.parse(JSON.stringify(DATASET)))).toEqual(DATASET);
    const { experience: _dropped, ...rest } = DATASET;
    expect(parseDataset(rest)).toBeNull();
  });
});

describe("loadDataset", () => {
  it("reads the prerendered dataset, and is null for a broken artifact or a failing binding", async () => {
    expect(await loadDataset(fakeAssets())).toEqual(DATASET);
    expect(await loadDataset(fakeAssets({ "/api/dataset.json": "{truncated" }))).toBeNull();
    expect(await loadDataset(fakeAssets({ "/api/dataset.json": null }))).toBeNull();
    const failing = fakeFetcher(() => Promise.reject(new Error("binding down")));
    expect(await loadDataset(failing)).toBeNull();
  });
});

describe("parsePostList", () => {
  const LLMS = `# Murugappan M — Full Stack Engineer

> Full-stack engineer.

## Machine-readable feeds
- [Blog RSS](https://murugappan.dev/blog/rss.xml)
- [Full blog content for LLMs](https://murugappan.dev/blog/llms-full.txt)

## Blog posts
- [Why SiteGPT's chat runs on PartyKit](https://murugappan.dev/blog/sitegpt-partykit-durable-objects/): How one-process-per-room replaces socket.io + Redis.
- [Coin Change Problem](https://murugappan.dev/blog/coin-change-problem/): Find minimum number of coins.
`;
  const slugs = ["sitegpt-partykit-durable-objects", "coin-change-problem"];

  it("reads only the blog posts section, skipping the feed links", () => {
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
    expect(parsePostList("# Nothing here\n")).toEqual([]);
  });

  it("falls back to scanning the whole document when the section heading is missing", () => {
    const withoutHeading = LLMS.replace("## Blog posts\n", "");
    expect(parsePostList(withoutHeading).map(p => p.slug)).toEqual(slugs);
  });

  it("stops at the next section heading", () => {
    const withTrailer = `${LLMS}\n## Something else\n- [Nope](https://murugappan.dev/blog/nope/): no.\n`;
    expect(parsePostList(withTrailer).map(p => p.slug)).toEqual(slugs);
  });

  it("skips a line whose URL cannot be parsed and keeps the rest", () => {
    const lines =
      "## Blog posts\n- [Broken](http://[bad/blog/broken/): no.\n- [Fine](https://murugappan.dev/blog/fine/): yes.\n";
    expect(parsePostList(lines).map(p => p.slug)).toEqual(["fine"]);
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
});

describe("postMarkdownPath", () => {
  it.each([
    ["coin-change-problem", "/blog/coin-change-problem/index.md"],
    // Anything but a kebab-case token is rejected.
    ["../secrets", null],
    ["Mixed_Case", null],
    ["", null]
  ])("maps %j to %j", (slug, path) => {
    expect(postMarkdownPath(slug)).toBe(path);
  });
});

describe("parseContactRequest", () => {
  const valid = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    company: "Analytical Engines Ltd",
    message: "We are hiring a senior backend engineer for a healthcare data platform."
  };
  const minimal = { email: valid.email, message: valid.message };

  it("accepts a complete request", () => {
    expect(parseContactRequest(valid)).toEqual({ ok: true, value: valid, dryRun: false });
  });

  it.each([
    ["only email and message", minimal],
    [
      "surrounding whitespace, trimmed",
      { email: `  ${valid.email}  `, message: `  ${valid.message}  ` }
    ],
    ["blank optional fields, dropped", { ...valid, name: "   ", company: "" }]
  ])("accepts %s", (_, raw) => {
    expect(parseContactRequest(raw)).toEqual({ ok: true, value: minimal, dryRun: false });
  });

  it("reports a dryRun request separately from the message itself", () => {
    expect(parseContactRequest({ ...valid, dryRun: true })).toEqual({
      ok: true,
      value: valid,
      dryRun: true
    });
  });

  it.each<[string, unknown, string[]]>([
    ["a non-boolean dryRun", { ...valid, dryRun: "yes" }, ["dryRun"]],
    ["a string body", "hello", ["body"]],
    ["a null body", null, ["body"]],
    ["an array body", [], ["body"]],
    ["a missing email", { message: valid.message }, ["email"]],
    ["an email with no @", { ...minimal, email: "not-an-email" }, ["email"]],
    ["an email with no TLD", { ...minimal, email: "a@b" }, ["email"]],
    ["a non-string email", { ...minimal, email: 42 }, ["email"]],
    ["a too-short message", { ...minimal, message: "hi" }, ["message"]],
    [
      "a too-long message",
      { ...minimal, message: "x".repeat(CONTACT_LIMITS.message.max + 1) },
      ["message"]
    ],
    ["an over-long name", { ...valid, name: "x".repeat(CONTACT_LIMITS.name + 1) }, ["name"]],
    [
      "an over-long company",
      { ...valid, company: "x".repeat(CONTACT_LIMITS.company + 1) },
      ["company"]
    ],
    ["a non-string name", { ...valid, name: 42 }, ["name"]]
  ])("rejects %s", (_, raw, fields) => {
    expect(parseContactRequest(raw)).toMatchObject({
      ok: false,
      issues: fields.map(field => ({ field }))
    });
  });
});
