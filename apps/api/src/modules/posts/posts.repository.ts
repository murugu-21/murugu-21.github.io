import { Context, Data, Effect, Layer } from "effect";

import type { PostSummary } from "@murugappan/contracts/api/posts.ts";
import { POST_MARKDOWN, POSTS } from "#src/common/content.ts";

export class PostNotFound extends Data.TaggedError("PostNotFound")<{ readonly slug: string }> {}

export type Post = PostSummary & { markdown: string };

export class PostsRepository extends Context.Service<
  PostsRepository,
  {
    readonly all: Effect.Effect<PostSummary[]>;
    findBySlug(slug: string): Effect.Effect<Post, PostNotFound>;
  }
>()("@murugappan/api/PostsRepository") {
  static readonly layer = Layer.succeed(PostsRepository, {
    all: Effect.succeed(POSTS),
    findBySlug: Effect.fn("PostsRepository.findBySlug")(function* (slug: string) {
      const post = POSTS.find(p => p.slug === slug);
      const markdown = POST_MARKDOWN.get(slug);
      if (!post || markdown === undefined) return yield* new PostNotFound({ slug });
      return { ...post, markdown };
    })
  });
}
