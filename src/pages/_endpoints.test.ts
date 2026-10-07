import { writeFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { blogPost, setPosts } from "#src/lib/blog/fixtures.ts";
import { GET as aboutMarkdown } from "./about/index.md.ts";
import { GET as dataset } from "./api/dataset.json.ts";
import { GET as posts } from "./api/posts.json.ts";
import { GET as blogLlmsFull } from "./blog/llms-full.txt.ts";
import { GET as blogLlms } from "./blog/llms.txt.ts";
import { GET as blogIndexMarkdown } from "./blog/index.md.ts";
import {
  GET as postMarkdown,
  getStaticPaths as postMarkdownPaths
} from "./blog/[slug]/index.md.ts";
import { GET as homeMarkdown } from "./index.md.ts";
import { GET as siteLlms } from "./llms.txt.ts";

vi.mock("astro:content", async () => (await import("#src/lib/blog/fixtures.ts")).astroContentMock);
vi.mock("astro:env/server", () => ({ RESUME_PHONE: undefined }));

const POSTS = [
  blogPost({
    id: "first",
    title: "First post",
    date: "2024-02-03",
    description: "The first one",
    body: "  Hello **world**.\n"
  }),
  blogPost({ id: "nested/draft", title: "Nested", filePath: "content/blog/nested/draft/index.md" }),
  blogPost({ id: "second", title: "Second post", filePath: "content/blog/second/index.md" })
];

describe("markdown renditions of the site", () => {
  it("serve the same summary at /llms.txt, /index.md and /about/index.md", async () => {
    setPosts(POSTS.slice(0, 1));
    const llms = await siteLlms();
    const home = await homeMarkdown();
    const about = await aboutMarkdown();

    expect(llms.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(home.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(about.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    const text = await llms.text();
    expect(text).toContain(
      "## Blog posts\n- [First post](https://murugappan.dev/blog/first/): The first one\n"
    );
    expect(await home.text()).toBe(text);
    expect(await about.text()).toBe(text);
  });

  it("lists the posts at /blog/index.md and /blog/llms.txt", async () => {
    setPosts(POSTS.slice(0, 1));
    const line = "- [First post](https://murugappan.dev/blog/first/): The first one";

    expect(await (await blogIndexMarkdown()).text()).toBe(
      `# SDE Journey\n\n> A Technical blog on my experiences in the tech industry\n\n## Posts\n${line}\n`
    );
    expect(await (await blogLlms()).text()).toBe(
      `# SDE Journey\n\n> A Technical blog on my experiences in the tech industry, by Murugappan M.\n\n## Posts\n\n${line}\n`
    );
  });

  it("puts every post's body, dated and described, in /blog/llms-full.txt", async () => {
    setPosts(POSTS.slice(0, 1));
    const res = await blogLlmsFull();

    expect(await res.text()).toBe(
      [
        "# SDE Journey: full content",
        "",
        "> A Technical blog on my experiences in the tech industry, by Murugappan M.",
        "",
        "---",
        "",
        "# First post",
        "URL: https://murugappan.dev/blog/first/",
        "Date: 2024-02-03",
        "Description: The first one",
        "",
        "Hello **world**.",
        ""
      ].join("\n")
    );
  });
});

describe("post markdown routes", () => {
  it("exist for top-level posts with a source file only", async () => {
    setPosts(POSTS);
    expect(await postMarkdownPaths()).toEqual([
      { params: { slug: "second" }, props: { filePath: "content/blog/second/index.md" } }
    ]);
  });
});

describe("post markdown route", () => {
  it("serves the source file with its frontmatter", async () => {
    const source = "---\ntitle: Hello\n---\n\nBody text.\n";
    writeFileSync("/tmp/post.md", source);

    const res = postMarkdown({ props: { filePath: "/tmp/post.md" } });

    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(await res.text()).toBe(source);
  });
});

describe("/api/dataset.json", () => {
  it("serves the dataset the Worker reads, built from the portfolio data", async () => {
    const res = dataset();
    const Served = z.object({ person: z.object({ name: z.string(), headline: z.string() }) });

    expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(Served.parse(JSON.parse(await res.text())).person).toEqual({
      name: "Murugappan M",
      headline: "Full Stack Engineer"
    });
  });
});

describe("/api/posts.json", () => {
  it("lists the top-level posts newest first, with their one-line descriptions", async () => {
    setPosts(POSTS);
    const res = await posts();

    expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(JSON.parse(await res.text())).toEqual([
      {
        slug: "first",
        title: "First post",
        url: "https://murugappan.dev/blog/first/",
        description: "The first one"
      },
      {
        slug: "second",
        title: "Second post",
        url: "https://murugappan.dev/blog/second/",
        description: ""
      }
    ]);
  });
});
