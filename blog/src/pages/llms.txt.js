import { SITE_TITLE, SITE_DESCRIPTION, SITE_URL, AUTHOR } from "../consts"
import { getPublishedPosts, excerpt } from "../utils/posts"

// Generate /llms.txt (https://llmstxt.org) — a curated, structured map of the
// site so LLM crawlers and agents can discover and cite the content. Ported
// from the old gatsby-node.js onPostBuild hook; drafts are already excluded
// from production by getPublishedPosts.
export async function GET() {
  const posts = (await getPublishedPosts()).reverse() // newest first
  const base = SITE_URL.replace(/\/$/, "")

  const lines = [
    `# ${SITE_TITLE}`,
    ``,
    `> ${SITE_DESCRIPTION}${AUTHOR.name ? ` — by ${AUTHOR.name}` : ``}.`,
    ``,
    `## Posts`,
    ``,
  ]

  posts.forEach(post => {
    const title = post.data.title || post.id
    const url = `${base}/${post.id}/`
    const desc = (post.data.description || excerpt(post.body) || ``)
      .replace(/\s+/g, ` `)
      .trim()
    lines.push(desc ? `- [${title}](${url}): ${desc}` : `- [${title}](${url})`)
  })
  lines.push(``)

  return new Response(lines.join(`\n`), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
