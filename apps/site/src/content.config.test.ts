import { describe, expect, it, vi } from "vitest";

import { collections } from "./content.config";

vi.mock("astro:content", () => ({ defineCollection: <T>(config: T) => config }));

const parseFrontmatter = (data: unknown) => {
  const { schema } = collections.blog;
  if (typeof schema !== "object" || schema === null || !("safeParse" in schema)) {
    throw new Error("the blog collection has no schema object");
  }
  return schema.safeParse(data);
};

const valid = { title: "Hello", date: "2024-05-06", tags: ["backend"] };

describe("blog frontmatter", () => {
  it("fills in the optional fields and reads the date", () => {
    const result = parseFrontmatter(valid);

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
    expect(parseFrontmatter(data).success).toBe(false);
    expect(parseFrontmatter({ ...valid, tags: ["ai"] }).success).toBe(true);
  });
});
