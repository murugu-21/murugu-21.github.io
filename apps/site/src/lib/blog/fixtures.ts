import { postSource, type PostFields } from "@murugappan/content/fixtures.ts";
import type { Post } from "./posts";

export function blogPost({ id, ...fields }: PostFields & { id: string }): Post {
  const { data } = postSource({ slug: id, ...fields });
  return { id, collection: "blog", body: fields.body, data };
}
