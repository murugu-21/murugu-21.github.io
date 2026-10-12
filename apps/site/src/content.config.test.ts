import { describe, expect, it } from "vitest";
import { z } from "zod";

import { collections } from "./content.config";

function blogSchema() {
  const { schema } = collections.blog;
  if (!(schema instanceof z.ZodType)) throw new Error("the blog collection has no schema object");
  return schema;
}

const valid = { title: "Hello", date: "2024-05-06", tags: ["backend"] };

describe("blog frontmatter", () => {
  it("fills in the optional fields and reads the date", () => {
    const result = blogSchema().safeParse(valid);

    expect(result.data).toEqual({
      title: "Hello",
      date: new Date("2024-05-06"),
      tags: ["backend"],
      keywords: [],
      featured: false
    });
  });

  it.each([
    ["a tag outside the vocabulary", { ...valid, tags: ["gardening"] }],
    ["no tags", { ...valid, tags: [] }],
    ["more than three tags", { ...valid, tags: ["ai", "backend", "career", "react"] }],
    ["no title", { date: "2024-05-06", tags: ["ai"] }]
  ])("rejects %s", (_name, data) => {
    expect(blogSchema().safeParse(data).success).toBe(false);
    expect(blogSchema().safeParse({ ...valid, tags: ["ai"] }).success).toBe(true);
  });
});
