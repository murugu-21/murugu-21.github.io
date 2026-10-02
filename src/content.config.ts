import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

// Controlled tag vocabulary (the index's filter chips): broad, recurring
// reader intents only; precise terms go in `keywords`. Keep in sync with the
// README's "Tag vocabulary". Lowercase, kebab-case, singular, 1-3 per post.
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

// content/blog/<slug>/index.md; the id (URL slug) is the directory name.
// Drafts under content/blog/draft/ are filtered in src/blog/utils/posts.ts.
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
