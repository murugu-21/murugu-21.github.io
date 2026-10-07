// The text served to agents: /llms.txt, the blog post lines in /blog/llms.txt,
// and the markdown renditions served for Accept: text/markdown.
// The preamble is a ?raw .txt because it contains backticks.
import LLMS_PREAMBLE from "#src/data/llms-preamble.txt?raw";
import { BLOG_DESCRIPTION, BLOG_TITLE } from "#src/lib/site.ts";
import { getPublishedPosts, postDescription, postUrl, type Post } from "#src/lib/blog/posts.ts";

// llms.txt entries are line-based; a multi-line frontmatter description would break them.
export const oneLineDescription = (post: Post) => postDescription(post).replace(/\s+/g, " ").trim();

// Newest-first "- [title](url): description" lines, shared by /llms.txt and
// /blog/llms.txt so the two can't drift.
export async function postLines(): Promise<string[]> {
  const posts = await getPublishedPosts();
  return posts.map(post => {
    const link = `[${post.data.title}](${postUrl(post.id)})`;
    const desc = oneLineDescription(post);
    return desc ? `- ${link}: ${desc}` : `- ${link}`;
  });
}

/** /llms.txt: the hand-written site summary plus every blog post. */
export async function siteLlmsText(): Promise<string> {
  return `${LLMS_PREAMBLE.trimEnd()}\n\n## Blog posts\n${(await postLines()).join("\n")}\n`;
}

/** /blog/index.md: the blog's title and description over its post list. */
export async function blogIndexMarkdown(): Promise<string> {
  return `# ${BLOG_TITLE}\n\n> ${BLOG_DESCRIPTION}\n\n## Posts\n${(await postLines()).join("\n")}\n`;
}

export const textResponse = (body: string) =>
  new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });

export const markdownResponse = (body: string) =>
  new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
