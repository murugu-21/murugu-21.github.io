import { z } from "zod";

export const BLOG_TITLE = "SDE Journey";

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
  featured: z.boolean().default(false),
  shortTitle: z.string().optional()
});
export type BlogFrontmatter = z.infer<typeof BlogFrontmatter>;
