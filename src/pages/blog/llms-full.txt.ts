import { BLOG_TITLE, BLOG_DESCRIPTION, AUTHOR } from "#content/site.ts";
import { getPublishedPosts, postUrl } from "#src/lib/blog/posts.ts";
import { oneLineDescription, textResponse } from "#src/lib/llms.ts";

// /blog/llms-full.txt (https://llmstxt.org): every post's markdown body in one file.
export async function GET() {
  const posts = await getPublishedPosts();

  const lines = [
    `# ${BLOG_TITLE}: full content`,
    ``,
    `> ${BLOG_DESCRIPTION}, by ${AUTHOR.name}.`,
    ...posts.flatMap(post => [
      ``,
      `---`,
      ``,
      `# ${post.data.title}`,
      `URL: ${postUrl(post.id)}`,
      `Date: ${post.data.date.toISOString().slice(0, 10)}`,
      `Description: ${oneLineDescription(post)}`,
      ``,
      (post.body || ``).trim()
    ]),
    ``
  ];

  return textResponse(lines.join(`\n`));
}
