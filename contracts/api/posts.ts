// The blog post shapes the REST API and MCP tools return.

import { z } from "zod";

import { text } from "./fields";

// Also published as the slug `pattern` in the OpenAPI document and the MCP tool schema.
export const SLUG_PATTERN = "^[a-z0-9]+(?:-[a-z0-9]+)*$";
export const SLUG = new RegExp(SLUG_PATTERN);

// Shared by the REST `limit` param, the MCP tool schema and the OpenAPI document.
export const POSTS_LIMIT_MAX = 100;

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
