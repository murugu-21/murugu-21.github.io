import { BLOG_TITLE, BLOG_DESCRIPTION, AUTHOR } from "#src/lib/site.ts";
import { postLines, textResponse } from "#src/lib/llms.ts";

// /blog/llms.txt (https://llmstxt.org): a map of the blog's posts.
export async function GET() {
  const lines = [
    `# ${BLOG_TITLE}`,
    ``,
    `> ${BLOG_DESCRIPTION}, by ${AUTHOR.name}.`,
    ``,
    `## Posts`,
    ``,
    ...(await postLines()),
    ``
  ];
  return textResponse(lines.join(`\n`));
}
