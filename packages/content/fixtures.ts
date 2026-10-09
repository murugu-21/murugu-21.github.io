// Builds a PostSource for tests, defaulting every field the test doesn't care about.
import type { BlogFrontmatter } from "@murugappan/contracts/blog.ts";
import type { PostSource } from "./posts.ts";

export type PostFields = {
  title?: string;
  date?: string;
  description?: string;
  body?: string;
  tags?: BlogFrontmatter["tags"];
  keywords?: string[];
};

export function postSource({
  slug,
  title = slug,
  date = "2024-01-01",
  description,
  body = "",
  tags = ["backend"],
  keywords = []
}: PostFields & { slug: string }): PostSource {
  return {
    slug,
    body,
    data: { title, date: new Date(date), description, tags, keywords, featured: false }
  };
}
