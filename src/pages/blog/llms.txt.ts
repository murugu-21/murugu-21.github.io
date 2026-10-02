import { SITE_TITLE, SITE_DESCRIPTION, AUTHOR } from "../../blog/consts";
import { postLines } from "../../blog/utils/llms";

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
  return new Response(lines.join(`\n`), {
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}
