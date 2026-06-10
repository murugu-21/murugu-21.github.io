import { SITE_TITLE, SITE_DESCRIPTION, SITE_URL, AUTHOR } from "../consts"
import { getPublishedPosts, excerpt } from "../utils/posts"

// Generate /llms-full.txt (https://llmstxt.org) — the full markdown body of
// every post in one file, so LLM crawlers and agents can ingest the whole
// blog without fetching each page. Same ordering/filtering as llms.txt.js;
// drafts are already excluded from production by getPublishedPosts.
export async function GET() {
  const posts = (await getPublishedPosts()).reverse() // newest first
  const base = SITE_URL.replace(/\/$/, "")

  const lines = [
    `# ${SITE_TITLE} — full content`,
    ``,
    `> ${SITE_DESCRIPTION}${AUTHOR.name ? ` — by ${AUTHOR.name}` : ``}.`,
  ]

  posts.forEach(post => {
    const title = post.data.title || post.id
    const url = `${base}/${post.id}/`
    const date = post.data.date.toISOString().slice(0, 10)
    const desc = (post.data.description || excerpt(post.body) || ``)
      .replace(/\s+/g, ` `)
      .trim()
    lines.push(
      ``,
      `---`,
      ``,
      `# ${title}`,
      `URL: ${url}`,
      `Date: ${date}`,
      `Description: ${desc}`,
      ``,
      (post.body || ``).trim(),
    )
  })
  lines.push(``)

  return new Response(lines.join(`\n`), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
