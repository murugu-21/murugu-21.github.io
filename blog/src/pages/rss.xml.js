import rss from "@astrojs/rss"
import MarkdownIt from "markdown-it"
import sanitizeHtml from "sanitize-html"

import { SITE_TITLE, SITE_DESCRIPTION, SITE_URL } from "../consts"
import { getPublishedPosts, excerpt } from "../utils/posts"

const parser = new MarkdownIt()

// Post images are written relative to the post directory (`react.jpg` inside
// content/blog/react/index.md). Feed readers render the body detached from
// that directory, so those paths have to become absolute URLs pointing at
// assets the build actually emits. Importing them here runs them through
// Astro's asset pipeline and yields the hashed, base-prefixed public path.
const ORIGIN = new URL(SITE_URL).origin
const assets = import.meta.glob("../../content/blog/**/*.{jpg,jpeg,png,gif,webp,svg}", {
  eager: true,
})
const ASSET_URLS = new Map(
  Object.entries(assets).map(([file, mod]) => {
    const asset = mod.default
    return [
      file.replace("../../content/blog/", ""),
      ORIGIN + (typeof asset === "string" ? asset : asset.src),
    ]
  }),
)

// Point a post's relative <img src> at the emitted asset. Absolute URLs,
// root-relative paths and anchors are left untouched.
function absolutizeAssets(html, postId) {
  return html.replace(/(<img\b[^>]*?\bsrc=")([^"]+)(")/gi, (match, before, url, after) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(url)) return match
    const resolved = ASSET_URLS.get(`${postId}/${url.replace(/^\.\//, "")}`)
    return resolved ? before + resolved + after : match
  })
}

// Feed at /blog/rss.xml, ported from gatsby-plugin-feed: newest first, with
// the rendered post body in <content:encoded>.
export async function GET() {
  const posts = (await getPublishedPosts()).reverse()

  return rss({
    title: `${SITE_TITLE} RSS Feed`,
    description: SITE_DESCRIPTION,
    site: SITE_URL,
    items: posts.map(post => ({
      title: post.data.title,
      pubDate: post.data.date,
      link: `${SITE_URL}/${post.id}/`,
      description: post.data.description || excerpt(post.body),
      content: absolutizeAssets(
        sanitizeHtml(parser.render(post.body || ""), {
          allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
        }),
        post.id,
      ),
    })),
  })
}
