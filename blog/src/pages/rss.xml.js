import rss from "@astrojs/rss"
import MarkdownIt from "markdown-it"
import sanitizeHtml from "sanitize-html"

import { SITE_TITLE, SITE_DESCRIPTION, SITE_URL } from "../consts"
import { getPublishedPosts, excerpt } from "../utils/posts"

const parser = new MarkdownIt()

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
      content: sanitizeHtml(parser.render(post.body || ""), {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
      }),
    })),
  })
}
