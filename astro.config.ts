import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import { unified } from "@astrojs/markdown-remark";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import posthog from "@posthog/rollup-plugin";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { autolinkConfig } from "./src/blog/utils/rehype-autolink-config";
import remarkMermaid from "./src/blog/utils/remark-mermaid";
import { findMermaidFences } from "./src/blog/utils/mermaid-diagrams";

// slug -> ISO publish date, for sitemap <lastmod>.
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

// @astrojs/sitemap writes an index plus numbered chunks, but robots.txt,
// worker/not-found.ts and the api-catalog all name /sitemap.xml. Collapse the
// single chunk onto it.
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
        logger.info(`\`sitemap.xml\` created at \`${fileURLToPath(dir)}\``);
      }
    }
  };
}

// A markdown render error doesn't fail the build: the glob loader logs it,
// caches the empty result in node_modules/.astro and ships a blank article.
// So check every post has a body and one figure per ```mermaid fence
// (which also catches a stale cached render).
function blogPostBodies(): AstroIntegration {
  return {
    name: "blog-post-bodies",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        const root = path.join(process.cwd(), "content/blog");
        let checked = 0;
        for (const slug of fs.readdirSync(root)) {
          const source = path.join(root, slug, "index.md");
          if (!fs.existsSync(source)) continue; // draft/ holds nested posts, unpublished
          const page = new URL(`blog/${slug}/index.html`, dir);
          if (!fs.existsSync(page)) {
            throw new Error(`blog-post-bodies: dist/blog/${slug}/index.html was not built`);
          }
          const html = fs.readFileSync(page, "utf8");
          const body = html.match(/<section itemprop="articleBody">([\s\S]*?)<\/section>/);
          if (!body || body[1].trim() === "") {
            throw new Error(
              `blog-post-bodies: dist/blog/${slug}/index.html has an empty article body — ` +
                "its markdown failed to render (see the [glob-loader] error above); " +
                "fix it and clear node_modules/.astro, the empty render is cached"
            );
          }
          const fences = findMermaidFences(fs.readFileSync(source, "utf8")).length;
          const figures = html.match(/<figure class="mermaid-diagram">/g)?.length ?? 0;
          if (fences !== figures) {
            throw new Error(
              `blog-post-bodies: ${slug} has ${fences} mermaid fence(s) but ${figures} diagram figure(s) in dist — ` +
                "clear node_modules/.astro, the stale render is cached"
            );
          }
          checked++;
        }
        if (checked === 0) throw new Error("blog-post-bodies: no blog posts checked");
        logger.info(`${checked} post bodies checked`);
      }
    }
  };
}

// Hooked into `astro build` itself so deploy tools that run it directly don't
// skip these steps; `dir` follows the adapter's output location.
function buildArtifacts(): AstroIntegration {
  const run = (script: string, ...args: string[]) => {
    const result = spawnSync("bun", [script, ...args], { stdio: "inherit" });
    if (result.status !== 0) {
      throw new Error(`build-artifacts: ${script} ${args.join(" ")} failed`);
    }
  };
  return {
    name: "build-artifacts",
    hooks: {
      // Diagrams are gitignored. remark-mermaid renders them during content
      // sync, but posts cached in node_modules/.astro skip it.
      "astro:build:start": () => run("scripts/render-mermaid.ts"),
      // Registered last, so the site it prints from is final.
      "astro:build:done": ({ dir }) => run("scripts/generate-resume.ts", fileURLToPath(dir))
    }
  };
}

// `client:interaction`: hydrate on first input (src/directives/interaction.ts).
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

// Astro emits no modulepreload hints for the small chunks module scripts
// import, costing a dependent round trip. Hint static imports transitively;
// dynamic import() targets are interaction-gated and deliberately left out.
function modulePreloadHints(): AstroIntegration {
  const STATIC_IMPORT = /\b(?:from|import)\s*"(\.\/[^"]+\.js)"/g;
  const MODULE_SCRIPT = /<script type="module" src="(\/[^"]+\.js)"/g;
  const htmlFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return htmlFiles(full);
      return entry.name.endsWith(".html") ? [full] : [];
    });
  return {
    name: "module-preload-hints",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        const root = new URL(dir).pathname;
        const imports = new Map<string, string[]>();
        const staticImportsOf = (href: string): string[] => {
          let found = imports.get(href);
          if (found) return found;
          const file = path.join(root, href);
          found = fs.existsSync(file)
            ? Array.from(fs.readFileSync(file, "utf8").matchAll(STATIC_IMPORT), m =>
                path.posix.join(path.posix.dirname(href), m[1])
              )
            : [];
          imports.set(href, found);
          return found;
        };
        let hinted = 0;
        for (const file of htmlFiles(root)) {
          const html = fs.readFileSync(file, "utf8");
          const entries = Array.from(html.matchAll(MODULE_SCRIPT), m => m[1]);
          if (!entries.length) continue;
          const deps = new Set<string>();
          const walk = (href: string) => {
            for (const dep of staticImportsOf(href)) {
              if (deps.has(dep) || entries.includes(dep)) continue;
              deps.add(dep);
              walk(dep);
            }
          };
          entries.forEach(walk);
          if (!deps.size) continue;
          const links = Array.from(deps, d => `<link rel="modulepreload" href="${d}">`).join("");
          // before the first module script, so the preload scanner sees them together
          const at = html.indexOf('<script type="module" src="');
          fs.writeFileSync(file, html.slice(0, at) + links + html.slice(at));
          hinted += 1;
        }
        logger.info(`modulepreload hints added to ${hinted} page(s)`);
      }
    }
  };
}

// PostHog source maps: uploaded then deleted, so no .map is served. Set only in
// the Workers Builds production env.
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY?.trim();
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID?.trim();

export default defineConfig({
  site: "https://murugappan.dev",
  output: "static",
  // Builds the Worker (wrangler.jsonc `main`) alongside the prerendered site.
  // Pinned to a pkg.pr.new preview of withastro/astro#18202: released
  // versions silently drop a custom-entrypoint Worker from a static site
  // (withastro/astro#18201). Move to the release that ships it.
  adapter: cloudflare({
    // build-time sharp only, so no Images binding
    imageService: "compile",
    // Node, not workerd: build hooks and several pages read the filesystem.
    prerenderEnvironment: "node"
  }),
  // otherwise the adapter provisions an unused SESSION KV namespace
  session: false,
  server: { port: 4399 },
  build: {
    assets: "static",
    // An external sheet cost a render-blocking round trip (~150 ms mobile
    // FCP); inlining adds ~14 KB gzipped per page, which is cheaper.
    inlineStylesheets: "always"
  },
  integrations: [
    react(),
    clientInteractionDirective(),
    modulePreloadHints(),
    sitemap({
      // only a top-level /404 is auto-excluded
      filter: page => !/\/404\/?$/.test(page),
      serialize(item) {
        const { pathname } = new URL(item.url);
        // explicit: /blog/ strips to "" below, not "blog"
        if (pathname === "/blog/") {
          item.lastmod = NEWEST_POST;
          return item;
        }
        // portfolio pages get no <lastmod>: nothing tracks their edits
        const slug = pathname.replace(/^\/blog\//, "").replace(/\/$/, "");
        const lastmod = POST_DATES[slug];
        if (lastmod) item.lastmod = lastmod;
        return item;
      }
    }),
    singleFileSitemap(),
    blogPostBodies(),
    buildArtifacts()
  ],
  vite: {
    // Dev only: started on a warm node_modules/.vite/deps_ssr cache, every page
    // renders as a 51-byte /@vite/client stub ("Unable to resolve
    // Layout.astro?astro&type=script…"). Re-optimizing each start avoids it.
    environments: { ssr: { optimizeDeps: { force: true } } },
    server: {
      // In dev the Worker reads ASSETS via https://assets.local
      // (worker/api/store.ts); Vite's host check would 403 it.
      allowedHosts: ["assets.local"]
    },
    // 8 KB for CSS only. A plain number would also inline font subsets into
    // the stylesheets (tripled the island sheet). `undefined` keeps the default.
    build: {
      assetsInlineLimit: (file, content) =>
        file.endsWith(".css") ? content.byteLength < 8192 : undefined
    },
    plugins: [
      // single entry: src/styles/global.css
      tailwindcss(),
      // the default host (us.i.posthog.com) matches the SDK's US project
      ...(POSTHOG_API_KEY && POSTHOG_PROJECT_ID
        ? [
            posthog({
              personalApiKey: POSTHOG_API_KEY,
              projectId: POSTHOG_PROJECT_ID,
              sourcemaps: { enabled: true, deleteAfterUpload: true }
            })
          ]
        : [])
    ]
  },
  markdown: {
    // Astro 7's default satteri processor doesn't run unified plugins.
    // remarkMermaid swaps fences for the build-rendered SVGs; no diagram code ships.
    processor: unified({
      remarkPlugins: [remarkMermaid],
      rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, autolinkConfig]]
    }),
    // token palettes live in src/blog/styles/code.css
    syntaxHighlight: "prism"
  }
});
