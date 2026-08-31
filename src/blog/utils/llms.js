import { SITE_URL } from "../consts"
import { excerpt, getPublishedPosts } from "./posts"

// Newest-first "- [title](url): description" lines describing every published
// post. Shared by /llms.txt (site-wide map) and /blog/llms.txt (blog-only map)
// so the two can never drift.
export async function postLines() {
  const posts = (await getPublishedPosts()).reverse()
  const base = SITE_URL.replace(/\/$/, "")
  return posts.map(post => {
    const title = post.data.title || post.id
    const url = `${base}/${post.id}/`
    const desc = (post.data.description || excerpt(post.body) || ``)
      .replace(/\s+/g, ` `)
      .trim()
    return desc ? `- [${title}](${url}): ${desc}` : `- [${title}](${url})`
  })
}
