import fs from "node:fs";
import path from "node:path";
import {defineConfig} from "astro/config";
import {unified} from "@astrojs/markdown-remark";
import {FontaineTransform} from "fontaine";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import {autolinkConfig} from "./src/blog/utils/rehype-autolink-config.mjs";

// slug -> ISO publish date from each post's frontmatter, used as the sitemap
// <lastmod> so crawlers can prioritize recently-updated pages.
function postDates() {
  const root = path.join(process.cwd(), "content/blog");
  const dates = {};
  for (const dir of fs.readdirSync(root)) {
    const file = path.join(root, dir, "index.md");
    if (!fs.existsSync(file)) continue;
    const match = fs
      .readFileSync(file, "utf8")
      .match(/^date:\s*"?([^"\n]+)"?\s*$/m);
    if (match) dates[dir] = new Date(match[1]).toISOString();
  }
  return dates;
}
const POST_DATES = postDates();
const NEWEST_POST = Object.values(POST_DATES).sort().pop();

// @astrojs/sitemap always writes "<filenameBase>-index.xml" plus numbered
// chunk files, but this site publishes one /sitemap.xml — robots.txt, the
// negotiated 404 body (worker/not-found.ts), the developer portal and the
// api-catalog all name that exact URL. Collapse the single chunk onto it.
// entryLimit is 45000 and the site has ~14 URLs, so there is only ever one.
function singleFileSitemap() {
  return {
    name: "single-file-sitemap",
    hooks: {
      "astro:build:done": ({dir, logger}) => {
        const chunk = new URL("sitemap-0.xml", dir);
        if (fs.existsSync(new URL("sitemap-1.xml", dir))) {
          throw new Error(
            "single-file-sitemap: more than one sitemap chunk was written"
          );
        }
        if (!fs.existsSync(chunk)) {
          throw new Error("single-file-sitemap: dist/sitemap-0.xml is missing");
        }
        fs.renameSync(chunk, new URL("sitemap.xml", dir));
        fs.rmSync(new URL("sitemap-index.xml", dir), {force: true});
        logger.info("`sitemap.xml` created at `dist`");
      }
    }
  };
}

export default defineConfig({
  site: "https://murugappan.dev",
  output: "static",
  build: {assets: "static"},
  integrations: [
    react(),
    sitemap({
      // The integration only recognises a top-level /404 as a status-code
      // page, so /blog/404/ has to be excluded by hand.
      filter: page => !/\/404\/?$/.test(page),
      serialize(item) {
        const {pathname} = new URL(item.url);
        // The blog index carries the newest post's date. NB /blog/ strips to
        // "" below, not "blog" — hence the explicit check.
        if (pathname === "/blog/") {
          item.lastmod = NEWEST_POST;
          return item;
        }
        // Posts carry their own publish date; portfolio pages get no
        // <lastmod> (nothing tracks when their hand-written copy changed).
        const slug = pathname.replace(/^\/blog\//, "").replace(/\/$/, "");
        const lastmod = POST_DATES[slug];
        if (lastmod) item.lastmod = lastmod;
        return item;
      }
    }),
    singleFileSitemap()
  ],
  vite: {
    plugins: [
      // Tailwind is scoped to the chat widget island (see chat.css — theme +
      // utilities only, no preflight, so it can't touch the site's SCSS).
      tailwindcss(),
      FontaineTransform.vite({
        fallbacks: ["Arial", "Georgia"],
        // @font-face src urls are relative to global.scss
        resolvePath: id => new URL("./src/styles/" + id, import.meta.url)
      }),
      // Generates metric-tuned fallback @font-face rules (size-adjust /
      // ascent-override etc.) for the @fontsource fonts the blog loads, so
      // the swap from the system fallback to Merriweather/Montserrat causes
      // no layout shift (fixes the ~0.2 CLS from font swap).
      FontaineTransform.vite({
        fallbacks: ["Georgia", "Times New Roman"],
        resolvePath: id => new URL("./node_modules/" + id, import.meta.url)
      })
    ]
  },
  markdown: {
    // Astro 7 defaults to the satteri processor, which doesn't run unified
    // plugins; the heading-anchor pair below needs the remark/rehype
    // pipeline, so opt back into it explicitly.
    processor: unified({
      rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, autolinkConfig]]
    }),
    // PrismJS class-based highlighting, matching gatsby-remark-prismjs; the
    // theme CSS (prismjs/themes/prism.css) is imported in the blog's
    // BaseLayout. Mermaid blocks stay as plain
    // <code class="language-mermaid"> and are rendered client-side.
    syntaxHighlight: "prism"
  }
});
