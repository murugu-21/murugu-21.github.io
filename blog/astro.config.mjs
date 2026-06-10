import fs from "node:fs"
import path from "node:path"
import { defineConfig } from "astro/config"
import react from "@astrojs/react"
import sitemap from "@astrojs/sitemap"
import rehypeSlug from "rehype-slug"
import rehypeAutolinkHeadings from "rehype-autolink-headings"
import { autolinkConfig } from "./src/utils/rehype-autolink-config.mjs"

// slug -> ISO publish date from each post's frontmatter, used as the
// sitemap <lastmod> so crawlers can prioritize recently-updated pages.
function postDates() {
  const root = path.join(process.cwd(), "content/blog")
  const dates = {}
  for (const dir of fs.readdirSync(root)) {
    const file = path.join(root, dir, "index.md")
    if (!fs.existsSync(file)) continue
    const match = fs.readFileSync(file, "utf8").match(/^date:\s*"?([^"\n]+)"?\s*$/m)
    if (match) dates[dir] = new Date(match[1]).toISOString()
  }
  return dates
}
const POST_DATES = postDates()
const NEWEST_POST = Object.values(POST_DATES).sort().pop()

// Served under murugappan.dev/blog (GitHub Pages project site under the
// user-site custom domain), same as the previous Gatsby pathPrefix setup.
export default defineConfig({
  site: "https://murugappan.dev",
  base: "/blog",
  integrations: [
    react(),
    sitemap({
      serialize(item) {
        const slug = new URL(item.url).pathname
          .replace(/^\/blog\//, "")
          .replace(/\/$/, "")
        // posts get their publish date; the index gets the newest post's date
        const lastmod = slug === "" ? NEWEST_POST : POST_DATES[slug]
        if (lastmod) item.lastmod = lastmod
        return item
      },
    }),
  ],
  markdown: {
    // PrismJS class-based highlighting, matching gatsby-remark-prismjs; the
    // theme CSS (prismjs/themes/prism.css) is imported in BaseLayout. Mermaid
    // blocks stay as plain <code class="language-mermaid"> and are rendered
    // client-side (see BaseLayout script).
    syntaxHighlight: "prism",
    rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, autolinkConfig]],
  },
})
