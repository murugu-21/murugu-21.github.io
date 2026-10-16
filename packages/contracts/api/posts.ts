import { z } from "zod";

import { text } from "./fields";

export const SLUG_PATTERN = "^[a-z0-9]+(?:-[a-z0-9]+)*$";
export const SLUG = new RegExp(SLUG_PATTERN);

export const POSTS_LIMIT_MAX = 100;
const SEARCH_TEXT_MAX = 200;

const LIMIT_ISSUE = `must be an integer between 1 and ${POSTS_LIMIT_MAX}`;

export const PostsSearchText = z
  .string()
  .max(SEARCH_TEXT_MAX, { error: `must be at most ${SEARCH_TEXT_MAX} characters` });
export const PostsLimit = z.int({ error: LIMIT_ISSUE }).min(1).max(POSTS_LIMIT_MAX);

export const PostsQuery = z.object({
  q: PostsSearchText.optional().meta({
    description: "Case-insensitive substring matched against post titles and summaries."
  }),
  limit: z.coerce.number({ error: LIMIT_ISSUE }).pipe(PostsLimit).optional().meta({
    description: "Maximum number of posts to return, newest first. Defaults to all of them."
  })
});

const postFields = {
  title: text("Post title."),
  url: text("Canonical URL of the post.", { format: "uri" }),
  description: text("One-line summary of the post.")
};

export const PostSummary = z
  .object({
    slug: z.string().regex(SLUG).meta({ description: "Identifier to pass to getBlogPost." }),
    ...postFields
  })
  .meta({ title: "PostSummary", description: "A blog post without its body." });
export type PostSummary = z.infer<typeof PostSummary>;

export const PostList = z
  .object({
    posts: z.array(PostSummary).meta({ description: "Matching posts, newest first." }),
    count: z.int().min(0).meta({ description: "How many posts are in `posts`." })
  })
  .meta({ title: "PostList", description: "Response body of listBlogPosts." });

export const Post = z
  .object({
    slug: z.string().regex(SLUG).meta({ description: "The post's slug." }),
    ...postFields,
    markdown: text("The post's complete markdown source, frontmatter included.")
  })
  .meta({ title: "Post", description: "Response body of getBlogPost." });
