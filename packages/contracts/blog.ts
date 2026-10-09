// A blog post's frontmatter: packages/content/blog/<slug>/index.md. The site's content collection
// validates it at build time.

import { z } from "zod";

// Controlled tag vocabulary (the index's filter chips): broad, recurring
// reader intents only; precise terms go in `keywords`. Keep in sync with
// "Tag vocabulary" in packages/content/blog/README.md. Lowercase, kebab-case,
// singular, 1-3 per post.
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

export const BlogFrontmatter = z.object({
  title: z.string(),
  date: z.coerce.date(),
  description: z.string().optional(),
  tags: z.array(z.enum(BLOG_TAGS)).min(1).max(3),
  keywords: z.array(z.string()).default([]),
  // Shown as a card in the homepage's Blogs section.
  featured: z.boolean().default(false),
  // The card's title, when the full one doesn't fit its two lines.
  shortTitle: z.string().optional()
});
export type BlogFrontmatter = z.infer<typeof BlogFrontmatter>;
