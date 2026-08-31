import { SITE_TITLE, SITE_DESCRIPTION, AUTHOR } from "../../blog/consts"
import { postLines } from "../../blog/utils/llms"

// Generate /blog/llms.txt (https://llmstxt.org) — a structured map of the blog
// so LLM crawlers and agents can discover and cite the posts.
export async function GET() {
  const lines = [
    `# ${SITE_TITLE}`,
    ``,
    `> ${SITE_DESCRIPTION}${AUTHOR.name ? ` — by ${AUTHOR.name}` : ``}.`,
    ``,
    `## Posts`,
    ``,
    ...(await postLines()),
    ``,
  ]
  return new Response(lines.join(`\n`), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
