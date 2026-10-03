import { SITE_TITLE, SITE_DESCRIPTION, AUTHOR } from "../../blog/consts";
import { oneLineDescription } from "../../blog/utils/llms";
import { getPublishedPosts, postUrl } from "../../blog/utils/posts";
import { textResponse } from "../../lib/llms";

// /blog/llms-full.txt (https://llmstxt.org): every post's markdown body in one file.
export async function GET() {
  const posts = (await getPublishedPosts()).reverse(); // newest first

  const lines = [
    `# ${SITE_TITLE} — full content`,
    ``,
    `> ${SITE_DESCRIPTION} — by ${AUTHOR.name}.`
  ];

  posts.forEach(post => {
    lines.push(
      ``,
      `---`,
      ``,
      `# ${post.data.title}`,
      `URL: ${postUrl(post.id)}`,
      `Date: ${post.data.date.toISOString().slice(0, 10)}`,
      `Description: ${oneLineDescription(post)}`,
      ``,
      (post.body || ``).trim()
    );
  });
  lines.push(``);

  return textResponse(lines.join(`\n`));
}
