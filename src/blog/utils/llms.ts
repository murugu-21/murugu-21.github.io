import { getPublishedPosts, postDescription, postUrl, type Post } from "./posts";

// llms.txt entries are line-based; a multi-line frontmatter description would break them.
export const oneLineDescription = (post: Post) => postDescription(post).replace(/\s+/g, " ").trim();

// Newest-first "- [title](url): description" lines, shared by /llms.txt and
// /blog/llms.txt so the two can't drift.
export async function postLines(): Promise<string[]> {
  const posts = (await getPublishedPosts()).reverse();
  return posts.map(post => {
    const link = `[${post.data.title}](${postUrl(post.id)})`;
    const desc = oneLineDescription(post);
    return desc ? `- ${link}: ${desc}` : `- ${link}`;
  });
}
