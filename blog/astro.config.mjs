import fs from "node:fs"
import path from "node:path"
import { defineConfig } from "astro/config"
import { unified } from "@astrojs/markdown-remark"
import { FontaineTransform } from "fontaine"
import react from "@astrojs/react"
import tailwindcss from "@tailwindcss/vite"
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
  vite: {
    plugins: [
      // Tailwind is scoped to the shared chat widget island (theme +
      // utilities only, no preflight — see ../src/components/chat/chat.css).
      tailwindcss(),
      // Generates metric-tuned fallback @font-face rules (size-adjust /
      // ascent-override etc.) for the @fontsource fonts so the swap from
      // the system fallback to Merriweather/Montserrat causes no layout
      // shift (fixes the ~0.2 CLS from font swap).
      FontaineTransform.vite({
        fallbacks: ["Georgia", "Times New Roman"],
        resolvePath: id => new URL("./node_modules/" + id, import.meta.url),
      }),
    ],
    server: { fs: { allow: [".."] } },
    // The shared chat widget lives in ../src and would otherwise resolve the
    // ROOT node_modules copy of React while the blog renderer uses its own —
    // two React instances = invalid hook call. Dedupe pins one copy, and the
    // react-consuming widget deps (root-installed) must be bundled rather
    // than SSR-externalized or they'd node-resolve root React again.
    // noExternal belongs under `resolve` as of Vite 8 — it silently does
    // nothing under the old `ssr` key or under `environments.ssr.resolve`,
    // and the failure only shows up at render time as a null-dispatcher
    // "Cannot read properties of null (reading 'useContext')".
    resolve: {
      dedupe: ["react", "react-dom"],
      noExternal: [
        "lucide-react",
        "@radix-ui/react-slot",
        "@radix-ui/react-scroll-area",
        "@radix-ui/react-dropdown-menu",
      ],
    },
  },
  integrations: [
    react(),
    sitemap({
      // Astro 7 surfaces the base path itself ("/blog") as a route alongside
      // the index ("/blog/"), which would put both in the merged root sitemap
      // as duplicates. Keep only the trailing-slash form.
      filter: page => page !== "https://murugappan.dev/blog",
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
    // Astro 7 defaults to the satteri processor, which doesn't run unified
    // plugins; the heading-anchor pair below needs the remark/rehype pipeline,
    // so opt back into it explicitly.
    processor: unified({
      rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, autolinkConfig]],
    }),
    // PrismJS class-based highlighting, matching gatsby-remark-prismjs; the
    // theme CSS (prismjs/themes/prism.css) is imported in BaseLayout. Mermaid
    // blocks stay as plain <code class="language-mermaid"> and are rendered
    // client-side (see BaseLayout script).
    syntaxHighlight: "prism",
  },
})
