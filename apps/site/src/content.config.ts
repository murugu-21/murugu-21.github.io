import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";

import { BlogFrontmatter } from "@murugappan/contracts/blog.ts";

const blog = defineCollection({
  loader: glob({
    pattern: "**/index.md",
    base: "../../packages/content/blog",
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, "")
  }),
  schema: BlogFrontmatter
});

export const collections = { blog };
