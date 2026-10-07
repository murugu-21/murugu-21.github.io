// Fixtures for tests of code that reads the `blog` content collection. The test file mocks
// "astro:content" with `astroContentMock` and sets what the collection holds via `setPosts`.
import type { Post } from "./posts";

let posts: Post[] = [];

export const setPosts = (next: Post[]): void => {
  posts = next;
};

export const astroContentMock = {
  getCollection: async (_name: string, filter?: (post: Post) => boolean) =>
    filter ? posts.filter(filter) : [...posts]
};

export function blogPost({
  id,
  title = id,
  date = "2024-01-01",
  description,
  body,
  tags = ["backend"],
  keywords = [],
  filePath
}: {
  id: string;
  title?: string;
  date?: string;
  description?: string;
  body?: string;
  tags?: Post["data"]["tags"];
  keywords?: string[];
  filePath?: string;
}): Post {
  return {
    id,
    collection: "blog",
    body,
    filePath,
    data: { title, date: new Date(date), description, tags, keywords, featured: false }
  };
}
