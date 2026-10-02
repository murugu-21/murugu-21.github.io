import { SITE_URL } from "../consts";
import { excerpt, getPublishedPosts } from "./posts";

// Newest-first "- [title](url): description" lines, shared by /llms.txt and
// /blog/llms.txt so the two can't drift.
export async function postLines(): Promise<string[]> {
  const posts = (await getPublishedPosts()).reverse();
  const base = SITE_URL.replace(/\/$/, "");
  return posts.map(post => {
    const title = post.data.title;
    const url = `${base}/${post.id}/`;
    const desc = (post.data.description || excerpt(post.body)).replace(/\s+/g, ` `).trim();
    return desc ? `- [${title}](${url}): ${desc}` : `- [${title}](${url})`;
  });
}
