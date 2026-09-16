import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

// The blog's controlled tag vocabulary — the visible filter chips on the
// index. A tag is a broad reader intent that recurs across posts, not a label
// for one article: `javascript` and `career` are tags, `kafka` and `debezium`
// are not. Precise terms go in the optional `keywords` field instead, which
// feeds JSON-LD, `article:tag` and the index's search haystack but never
// renders as a chip. Keep this list in sync with the README's "Tag vocabulary"
// section. Naming: lowercase, kebab-case, singular, 1-3 tags per post.
// (A tag with no posts yet is fine: chips are derived from post counts, so it
// stays invisible until used.)
const BLOG_TAGS = [
  "ai",
  "algorithms",
  "backend",
  "career",
  "databases",
  "fundamentals",
  "javascript",
  "react",
  "system-design"
] as const;

// Posts live in content/blog/<slug>/index.md, same layout as the Gatsby site.
// The id (= URL slug) is the directory name, matching Gatsby's createFilePath
// slugs. Drafts under content/blog/draft/ are filtered out of production in
// src/blog/utils/posts.ts.
const blog = defineCollection({
  loader: glob({
    pattern: "**/index.md",
    base: "./content/blog",
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, "")
  }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    tags: z.array(z.enum(BLOG_TAGS)).min(1).max(3),
    keywords: z.array(z.string()).default([])
  })
});

export const collections = { blog };
