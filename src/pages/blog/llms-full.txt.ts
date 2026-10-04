import { SITE_TITLE, SITE_DESCRIPTION, AUTHOR } from "#src/blog/consts.ts";
import { oneLineDescription } from "#src/blog/utils/llms.ts";
import { getPublishedPosts, postUrl } from "#src/blog/utils/posts.ts";
import { textResponse } from "#src/lib/llms.ts";

// /blog/llms-full.txt (https://llmstxt.org): every post's markdown body in one file.
export async function GET() {
  const posts = (await getPublishedPosts()).reverse(); // newest first

  const lines = [
    `# ${SITE_TITLE}: full content`,
    ``,
    `> ${SITE_DESCRIPTION}, by ${AUTHOR.name}.`,
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
