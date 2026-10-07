import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { defineConfig, envField, fontProviders } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import { rehypeHeadingIds, unified } from "@astrojs/markdown-remark";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import posthog from "@posthog/rollup-plugin";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { z } from "zod";
import { autolinkConfig } from "./src/lib/blog/rehype-autolink-config";
import remarkMermaid from "./src/lib/blog/remark-mermaid";
import { findMermaidFences } from "./src/lib/blog/mermaid-diagrams";
import { NIGHT_OWL } from "./src/lib/blog/code-themes";
import { SITE_ORIGIN } from "./src/lib/site";
import { FIRA_CODE_SUBSET, writeFiraCodeSubset } from "./scripts/fira-code-subset";

const BLOG_CONTENT = path.join(process.cwd(), "content/blog");

// Maps each slug to its ISO publish date, for the sitemap's <lastmod>.
function postDates(): Record<string, string> {
  const dates: Record<string, string> = {};
  for (const dir of fs.readdirSync(BLOG_CONTENT)) {
    const file = path.join(BLOG_CONTENT, dir, "index.md");
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
          throw new Error("single-file-sitemap: sitemap-0.xml is missing from the build");
        }
        fs.renameSync(chunk, new URL("sitemap.xml", dir));
        fs.rmSync(new URL("sitemap-index.xml", dir), { force: true });
        logger.info(`\`sitemap.xml\` created at \`${fileURLToPath(dir)}\``);
      }
    }
  };
}

// What search engines read from each post's head, checked against literals
// rather than the constants that produced it: one canonical URL, and a
// BlogPosting whose author resolves to the Person in the same @graph.
const jsonLdGraph = z.object({
  "@graph": z.array(z.record(z.string(), z.unknown()))
});

function checkPostHead({ slug, html }: { slug: string; html: string }) {
  const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map(m => m[1]);
  const expected = `https://murugappan.dev/blog/${slug}/`;
  if (canonicals.length !== 1 || canonicals[0] !== expected) {
    throw new Error(
      `blog-post-checks: ${slug} has canonical(s) [${canonicals.join(", ")}], expected exactly ${expected}`
    );
  }
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1) {
    throw new Error(
      `blog-post-checks: ${slug} has ${scripts.length} JSON-LD blocks, expected one @graph`
    );
  }
  const graph = jsonLdGraph.parse(JSON.parse(scripts[0][1]))["@graph"];
  const posting = graph.find(node => node["@type"] === "BlogPosting");
  const authorId = z.object({ "@id": z.string() }).safeParse(posting?.author).data?.["@id"];
  const author = graph.find(node => node["@id"] === authorId);
  if (!authorId || author?.["@type"] !== "Person" || author.name !== "Murugappan M") {
    throw new Error(
      `blog-post-checks: ${slug}'s BlogPosting author doesn't resolve to the Person "Murugappan M" in its @graph`
    );
  }
}

// A markdown render error doesn't fail the build. The glob loader logs it,
// caches the empty result in node_modules/.astro and ships a blank article.
// So check every post has a body and one figure per ```mermaid fence
// (which also catches a stale cached render), then check its head.
function blogPostChecks(): AstroIntegration {
  return {
    name: "blog-post-checks",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        let checked = 0;
        for (const slug of fs.readdirSync(BLOG_CONTENT)) {
          const source = path.join(BLOG_CONTENT, slug, "index.md");
          if (!fs.existsSync(source)) continue; // draft/ holds nested posts, unpublished
          const page = new URL(`blog/${slug}/index.html`, dir);
          if (!fs.existsSync(page)) {
            throw new Error(`blog-post-checks: blog/${slug}/index.html was not built`);
          }
          const html = fs.readFileSync(page, "utf8");
          const body = html.match(/<section data-post-body>([\s\S]*?)<\/section>/);
          if (!body || body[1].trim() === "") {
            throw new Error(
              `blog-post-checks: blog/${slug}/index.html has an empty article body. ` +
                "Its markdown failed to render (see the [glob-loader] error above). " +
                "Fix it and clear node_modules/.astro, which caches the empty render."
            );
          }
          const fences = findMermaidFences(fs.readFileSync(source, "utf8")).length;
          const figures = html.match(/<figure class="mermaid-diagram">/g)?.length ?? 0;
          if (fences !== figures) {
            throw new Error(
              `blog-post-checks: ${slug} has ${fences} mermaid fence(s) but ${figures} diagram figure(s) in the build. ` +
                "Clear node_modules/.astro, which caches the stale render."
            );
          }
          checkPostHead({ slug, html });
          checked++;
        }
        if (checked === 0) throw new Error("blog-post-checks: no blog posts checked");
        logger.info(`${checked} posts checked`);
      }
    }
  };
}

// Hooked into `astro build` itself so deploy tools that run it directly don't
// skip these steps; `dir` follows the adapter's output location.
function buildArtifacts(): AstroIntegration {
  const run = (command: string, args: string[]) => {
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.status !== 0) {
      throw new Error(`build-artifacts: ${command} ${args.join(" ")} failed`);
    }
  };
  return {
    name: "build-artifacts",
    hooks: {
      // Diagrams are gitignored. remark-mermaid renders them during content
      // sync, but posts cached in node_modules/.astro skip it.
      "astro:build:start": () => run("bun", ["scripts/render-mermaid.ts"]),
      // Registered last, so the site it prints from is final.
      "astro:build:done": ({ dir }) =>
        run("node", ["scripts/generate-resume.ts", fileURLToPath(dir)])
    }
  };
}

// `output: "server"` is what makes the adapter emit the Worker in cloudflare.config.ts,
// but every page stays static. Server mode marks routes `prerender: false`, so this
// overrides it rather than filling a gap.
function prerenderEveryRoute(): AstroIntegration {
  return {
    name: "prerender-every-route",
    hooks: {
      "astro:route:setup": ({ route }) => {
        route.prerender = true;
      }
    }
  };
}

// Writes the font file the `fonts` entry below reads. config:setup runs before
// the Fonts API resolves its sources, in dev and build alike.
function firaCodeSubset(): AstroIntegration {
  return {
    name: "fira-code-subset",
    hooks: { "astro:config:setup": () => writeFiraCodeSubset() }
  };
}

// Registers `client:interaction`, which hydrates on first input (src/directives/interaction.ts).
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
          hinted++;
        }
        logger.info(`modulepreload hints added to ${hinted} page(s)`);
      }
    }
  };
}

// PostHog source maps are uploaded then deleted, so no .map is served. Workers
// Builds sets these env vars only in production.
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY?.trim();
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID?.trim();

export default defineConfig({
  site: SITE_ORIGIN,
  // With "static" the adapter emits an assets-only Worker and silently drops the
  // custom entrypoint (withastro/astro#18208). prerenderEveryRoute keeps the pages static.
  output: "server",
  // Builds the Worker in cloudflare.config.ts alongside the prerendered site.
  adapter: cloudflare({
    // build-time sharp only, so no Images binding
    imageService: "compile",
    // Node, not workerd, because build hooks and several pages read the filesystem.
    prerenderEnvironment: "node"
  }),
  // otherwise the adapter provisions an unused SESSION KV namespace
  session: false,
  // Validated at build, so a malformed value fails the build instead of shipping.
  env: {
    schema: {
      PUBLIC_CHAT_HOST: envField.string({ context: "client", access: "public", optional: true }),
      // A public project key (phc_), written into meta tags at build; never the personal phx_ key.
      POST_HOG_TOKEN: envField.string({
        context: "server",
        access: "public",
        optional: true,
        startsWith: "phc_"
      }),
      POST_HOG_URL: envField.string({
        context: "server",
        access: "public",
        optional: true,
        url: true
      }),
      GITHUB_TOKEN: envField.string({ context: "server", access: "secret", optional: true }),
      // "1" fails the build instead of falling back when the profile fetch fails.
      REQUIRE_GITHUB_PROFILE: envField.enum({
        context: "server",
        access: "public",
        values: ["0", "1"],
        default: "0"
      }),
      RESUME_PHONE: envField.string({ context: "server", access: "secret", optional: true })
    }
  },
  // Also generates a fallback sized to Fira Code's metrics (local Courier New),
  // so the swap to Fira Code doesn't rewrap text; global.css's metric fallback
  // covers platforms without Courier New.
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Fira Code",
      cssVariable: "--font-fira-code",
      fallbacks: [
        "Fira Code metric fallback",
        "ui-monospace",
        "SFMono-Regular",
        "Menlo",
        "Consolas",
        "monospace"
      ],
      options: {
        variants: [{ src: [FIRA_CODE_SUBSET], weight: "300 700", style: "normal" }]
      }
    }
  ],
  server: { port: 4399 },
  build: {
    assets: "static",
    // An external sheet cost a render-blocking round trip (~150 ms mobile
    // FCP); inlining adds ~14 KB gzipped per page, which is cheaper.
    inlineStylesheets: "always"
  },
  integrations: [
    prerenderEveryRoute(),
    firaCodeSubset(),
    react(),
    clientInteractionDirective(),
    modulePreloadHints(),
    sitemap({
      // only a top-level /404 is auto-excluded
      filter: page => !/\/404\/?$/.test(page),
      serialize(item) {
        const { pathname } = new URL(item.url);
        // Matched before the strip below, which turns /blog/ into "", not "blog".
        if (pathname === "/blog/") {
          item.lastmod = NEWEST_POST;
          return item;
        }
        // portfolio pages get no <lastmod>, since nothing tracks their edits
        const slug = pathname.replace(/^\/blog\//, "").replace(/\/$/, "");
        const lastmod = POST_DATES[slug];
        if (lastmod) item.lastmod = lastmod;
        return item;
      }
    }),
    singleFileSitemap(),
    blogPostChecks(),
    buildArtifacts()
  ],
  vite: {
    // Dev only. Started on a warm node_modules/.vite/deps_ssr cache, every page
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
      rehypePlugins: [rehypeHeadingIds, [rehypeAutolinkHeadings, autolinkConfig]]
    }),
    // Both themes ride on each span as --shiki-light / --shiki-dark;
    // src/styles/blog/code.css picks one per site theme.
    syntaxHighlight: "shiki",
    shikiConfig: { themes: NIGHT_OWL, defaultColor: false }
  }
});
