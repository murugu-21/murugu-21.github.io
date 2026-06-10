import { defineCollection, z } from "astro:content"
import { glob } from "astro/loaders"

// Posts live in content/blog/<slug>/index.md, same layout as the Gatsby site.
// The id (= URL slug) is the directory name, matching Gatsby's createFilePath
// slugs. Drafts under content/blog/draft/ are filtered out of production in
// src/utils/posts.js.
const blog = defineCollection({
  loader: glob({
    pattern: "**/index.md",
    base: "./content/blog",
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, ""),
  }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    tags: z.array(z.string()),
  }),
})

export const collections = { blog }
