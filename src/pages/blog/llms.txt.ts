import { SITE_TITLE, SITE_DESCRIPTION, AUTHOR } from "../../blog/consts";
import { postLines } from "../../blog/utils/llms";
import { textResponse } from "../../lib/llms";

// /blog/llms.txt (https://llmstxt.org): a map of the blog's posts.
export async function GET() {
  const lines = [
    `# ${SITE_TITLE}`,
    ``,
    `> ${SITE_DESCRIPTION} — by ${AUTHOR.name}.`,
    ``,
    `## Posts`,
    ``,
    ...(await postLines()),
    ``
  ];
  return textResponse(lines.join(`\n`));
}
