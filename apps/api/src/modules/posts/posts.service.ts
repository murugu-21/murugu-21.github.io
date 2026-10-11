import { Context, Effect, Layer } from "effect";

import type { PostSummary } from "@murugappan/contracts/api/posts.ts";
import {
  PostsRepository,
  type Post,
  type PostNotFound
} from "#src/modules/posts/posts.repository.ts";

type PostList = { posts: PostSummary[]; count: number };

/** Case-insensitive substring match on title and description, then the first `limit`. */
function searchPosts({
  posts,
  query,
  limit
}: {
  posts: PostSummary[];
  query?: string;
  limit?: number;
}): PostSummary[] {
  const needle = query?.trim().toLowerCase();
  const matches = needle
    ? posts.filter(
        p => p.title.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle)
      )
    : posts;
  return limit === undefined ? matches : matches.slice(0, limit);
}

export class PostsService extends Context.Service<
  PostsService,
  {
    search(filter: { query?: string; limit?: number }): Effect.Effect<PostList>;
    findBySlug(slug: string): Effect.Effect<Post, PostNotFound>;
  }
>()("@murugappan/api/PostsService") {
  static readonly layer = Layer.effect(
    PostsService,
    Effect.gen(function* () {
      const repository = yield* PostsRepository;
      return {
        search: ({ query, limit }) =>
          repository.all.pipe(
            Effect.map(all => {
              const posts = searchPosts({ posts: all, query, limit });
              return { posts, count: posts.length };
            })
          ),
        findBySlug: slug => repository.findBySlug(slug)
      };
    })
  );
}
