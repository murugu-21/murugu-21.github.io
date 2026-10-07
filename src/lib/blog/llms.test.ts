import { describe, expect, it, vi } from "vitest";

import { postLines } from "#src/lib/llms.ts";
import { blogPost, setPosts } from "./fixtures";

vi.mock("astro:content", async () => (await import("./fixtures")).astroContentMock);

describe("llms text", () => {
  it("lists posts newest first, one line each, with the description when there is one", async () => {
    setPosts([
      blogPost({ id: "old", title: "Old post", date: "2023-01-01", description: "Plain summary" }),
      blogPost({
        id: "new",
        title: "New post",
        date: "2024-01-01",
        description: "Spans\n  two lines "
      }),
      blogPost({ id: "bare", title: "Bare", date: "2022-01-01" })
    ]);
    expect(await postLines()).toEqual([
      "- [New post](https://murugappan.dev/blog/new/): Spans two lines",
      "- [Old post](https://murugappan.dev/blog/old/): Plain summary",
      "- [Bare](https://murugappan.dev/blog/bare/)"
    ]);
  });
});
