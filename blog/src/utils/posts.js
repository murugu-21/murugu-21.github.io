import { getCollection } from "astro:content"
import getReadingTime from "reading-time"

// All posts, sorted by date ASC (the order gatsby-node.js used to wire up
// previous/next links). Drafts (content/blog/draft/**) are excluded from
// production builds, matching the old gatsby-source-filesystem ignore rule.
export async function getPublishedPosts() {
  const posts = await getCollection(
    "blog",
    post => !(import.meta.env.PROD && post.id.startsWith("draft/")),
  )
  return posts.sort((a, b) => a.data.date - b.data.date)
}

// Site-relative URL for a post, e.g. /blog/coin-change-problem/
export const postPath = id =>
  `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${id}/`

// Matches Gatsby's date(formatString: "MMMM DD, YYYY"), e.g. "August 09, 2021"
export function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  })
}

// Reading time in whole minutes from the raw markdown body (replaces
// Gatsby's MarkdownRemark.timeToRead).
export const timeToRead = body =>
  Math.max(1, Math.ceil(getReadingTime(body || "").minutes))

// Plain-text excerpt from the raw markdown body (replaces Gatsby's
// excerpt(pruneLength: 160)); used wherever frontmatter description is absent.
export function excerpt(body, length = 160) {
  const text = (body || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (text.length <= length) return text
  return text.slice(0, length).replace(/\s+\S*$/, "") + "…"
}
