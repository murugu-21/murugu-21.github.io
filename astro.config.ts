import fs from "node:fs";
import path from "node:path";
import type { AstroIntegration } from "astro";
import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { autolinkConfig } from "./src/blog/utils/rehype-autolink-config";

// slug -> ISO publish date from each post's frontmatter, used as the sitemap
// <lastmod> so crawlers can prioritize recently-updated pages.
function postDates(): Record<string, string> {
  const root = path.join(process.cwd(), "content/blog");
  const dates: Record<string, string> = {};
  for (const dir of fs.readdirSync(root)) {
    const file = path.join(root, dir, "index.md");
    if (!fs.existsSync(file)) continue;
    const match = fs.readFileSync(file, "utf8").match(/^date:\s*"?([^"\n]+)"?\s*$/m);
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
function singleFileSitemap(): AstroIntegration {
  return {
    name: "single-file-sitemap",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        const chunk = new URL("sitemap-0.xml", dir);
        if (fs.existsSync(new URL("sitemap-1.xml", dir))) {
          throw new Error("single-file-sitemap: more than one sitemap chunk was written");
        }
        if (!fs.existsSync(chunk)) {
          throw new Error("single-file-sitemap: dist/sitemap-0.xml is missing");
        }
        fs.renameSync(chunk, new URL("sitemap.xml", dir));
        fs.rmSync(new URL("sitemap-index.xml", dir), { force: true });
        logger.info("`sitemap.xml` created at `dist`");
      }
    }
  };
}

// Astro only special-cases a *top-level* /404 as a status-code page, so
// src/pages/blog/404.astro builds to dist/blog/404/index.html, not
// dist/blog/404.html. Cloudflare's `not_found_handling: "404-page"` walks up
// to the nearest 404.html for a miss, so without a copy at the old path
// every /blog/<miss> silently falls back to the portfolio's top-level 404 —
// no build error, just a wrong page in production. Restore the old path
// alongside the new one (verified with `wrangler dev` both ways).
function blogNotFoundCopy(): AstroIntegration {
  return {
    name: "blog-not-found-copy",
    hooks: {
      "astro:build:done": ({ dir }) => {
        const src = new URL("blog/404/index.html", dir);
        const dest = new URL("blog/404.html", dir);
        if (!fs.existsSync(src)) {
          throw new Error("blog-not-found-copy: dist/blog/404/index.html is missing");
        }
        fs.copyFileSync(src, dest);
        // Guard against copying the wrong page under a right-looking path:
        // this exact regression (dist/blog/404.html silently becoming some
        // other page, so misses fell back to the portfolio 404 with no build
        // error) already happened once on this branch and the build, test
        // suite and astro check all missed it. Assert the copy is actually
        // the blog's 404 by content, not just present.
        if (!fs.readFileSync(dest, "utf8").includes("SDE Journey")) {
          throw new Error(
            "blog-not-found-copy: dist/blog/404.html does not contain " +
              'the blog\'s title marker "SDE Journey" — wrong page copied'
          );
        }
      }
    }
  };
}

// `client:interaction` — hydrate an island on the visitor's first input rather
// than on idle. The reasoning lives with the directive itself,
// src/directives/interaction.ts; the attribute is typed in
// src/client-directives.d.ts.
function clientInteractionDirective(): AstroIntegration {
  return {
    name: "client-interaction-directive",
    hooks: {
      "astro:config:setup": ({ addClientDirective }) => {
        addClientDirective({
          name: "interaction",
          entrypoint: "./src/directives/interaction.ts"
        });
      }
    }
  };
}

export default defineConfig({
  site: "https://murugappan.dev",
  output: "static",
  server: { port: 4399 },
  build: { assets: "static" },
  integrations: [
    react(),
    clientInteractionDirective(),
    sitemap({
      // The integration only recognises a top-level /404 as a status-code
      // page, so /blog/404/ has to be excluded by hand.
      filter: page => !/\/404\/?$/.test(page),
      serialize(item) {
        const { pathname } = new URL(item.url);
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
    singleFileSitemap(),
    blogNotFoundCopy()
  ],
  vite: {
    // build.inlineStylesheets "auto" inlines a stylesheet into the page when
    // Vite's assetsInlineLimit says so. Raise that to 8 KB for CSS only, so
    // ScrollTop's ~7.6 KB scoped sheet rides in the HTML instead of costing a
    // render-blocking request; the 30 KB+ sheets stay external. CSS only
    // because the limit is otherwise global: as a plain number it also
    // base64-inlined every sub-8 KB font subset into the stylesheets that
    // reference them, which tripled the chat sheet's gzipped size (6 → 22
    // KB) on the critical path. `undefined` keeps Vite's 4 KB default for
    // everything else.
    build: {
      assetsInlineLimit: (file, content) =>
        file.endsWith(".css") ? content.byteLength < 8192 : undefined
    },
    plugins: [
      // Tailwind is scoped to the chat widget island (see chat.css — theme +
      // utilities only, no preflight, so it can't touch the site's SCSS).
      tailwindcss()
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
