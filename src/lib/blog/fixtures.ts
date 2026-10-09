// Fixtures for tests of code that reads the `blog` content collection. The test file mocks
// "astro:content" with `astroContentMock` and sets what the collection holds via `setPosts`.
import { postSource, type PostFields } from "#content/fixtures.ts";
import type { Post } from "./posts";

let posts: Post[] = [];

export const setPosts = (next: Post[]): void => {
  posts = next;
};

export const astroContentMock = {
  getCollection: async (_name: string, filter?: (post: Post) => boolean) =>
    filter ? posts.filter(filter) : [...posts]
};

export function blogPost({ id, ...fields }: PostFields & { id: string }): Post {
  const { data } = postSource({ slug: id, ...fields });
  return { id, collection: "blog", body: fields.body, data };
}
