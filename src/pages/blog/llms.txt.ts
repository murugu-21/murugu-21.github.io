import { SITE_TITLE, SITE_DESCRIPTION, AUTHOR } from "#src/lib/blog/consts.ts";
import { postLines } from "#src/lib/blog/llms.ts";
import { textResponse } from "#src/lib/llms.ts";

// /blog/llms.txt (https://llmstxt.org): a map of the blog's posts.
export async function GET() {
  const lines = [
    `# ${SITE_TITLE}`,
    ``,
    `> ${SITE_DESCRIPTION}, by ${AUTHOR.name}.`,
    ``,
    `## Posts`,
    ``,
    ...(await postLines()),
    ``
  ];
  return textResponse(lines.join(`\n`));
}
