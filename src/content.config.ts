import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";

import { BlogFrontmatter } from "#contracts/blog.ts";

// content/blog/<slug>/index.md; the id (URL slug) is the directory name.
// Drafts under content/blog/draft/ are filtered in src/lib/blog/posts.ts.
const blog = defineCollection({
  loader: glob({
    pattern: "**/index.md",
    base: "./content/blog",
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, "")
  }),
  schema: BlogFrontmatter
});

export const collections = { blog };
