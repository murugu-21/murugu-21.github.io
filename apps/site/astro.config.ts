import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { defineConfig, fontProviders } from "astro/config";
import { rehypeHeadingIds, unified } from "@astrojs/markdown-remark";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import posthog from "@posthog/rollup-plugin";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks, { type Options as ExternalLinksOptions } from "rehype-external-links";
import { parseHTML } from "linkedom";
import { z } from "zod";
import { autolinkConfig } from "./src/lib/blog/rehype-autolink-config";
import remarkMermaid from "./src/lib/blog/remark-mermaid";
import { findMermaidFences } from "./src/lib/blog/mermaid-diagrams";
import { NIGHT_OWL } from "./src/lib/blog/code-themes";
import { copyButton } from "./src/lib/blog/shiki-copy-button";
import { SITE_ORIGIN } from "@murugappan/content/site.ts";
import { BROWSER_TARGETS } from "./src/lib/browser-support";
import { FIRA_CODE_SUBSET, writeFiraCodeSubset } from "./scripts/fira-code-subset";
import { headersFile } from "./src/lib/headers";
import { modulePreloader } from "./scripts/module-preload";
import { ENV_SCHEMA, sourceMapUpload } from "./build-env";
import { contentPosts, readPosts } from "@murugappan/content/vite/posts-plugin.ts";

const POSTS = readPosts();

const POST_DATES: Record<string, string> = Object.fromEntries(
  POSTS.map(post => [post.slug, post.data.date.toISOString()])
);
const NEWEST_POST = Object.values(POST_DATES).sort().pop();

// @astrojs/sitemap writes an index plus numbered chunks, but robots.txt, not-found.ts and the
// api-catalog all name /sitemap.xml. Collapse the single chunk onto it.
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

function headersFileIntegration(): AstroIntegration {
  return {
    name: "headers-file",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        fs.writeFileSync(new URL("_headers", dir), headersFile());
        logger.info(`\`_headers\` created at \`${fileURLToPath(dir)}\``);
      }
    }
  };
}

type Post = { slug: string; document: Document; source: string };

function emptyBodyProblem({ slug, document }: Post) {
  if (document.querySelector("section[data-post-body]")?.innerHTML.trim()) return;
  return (
    `blog/${slug}/index.html has an empty article body. ` +
    "Its markdown failed to render (see the [glob-loader] error above). " +
    "Fix it and clear node_modules/.astro, which caches the empty render."
  );
}

function titleProblem({ slug, document }: Post) {
  if (document.querySelector("h1[data-post-title]")) return;
  return `blog/${slug}/index.html has no <h1 data-post-title>, so read-aloud would skip the title`;
}

function mermaidProblem({ slug, document, source }: Post) {
  const fences = findMermaidFences(source).length;
  const figures = document.querySelectorAll("figure[data-mermaid]").length;
  if (fences === figures) return;
  return (
    `${slug} has ${fences} mermaid fence(s) but ${figures} diagram figure(s) in the build. ` +
    "Clear node_modules/.astro, which caches the stale render."
  );
}

function copyButtonProblem({ slug, document }: Post) {
  const fences = document.querySelectorAll("pre.astro-code").length;
  const wrapped = document.querySelectorAll("figure[data-code-block] > pre.astro-code").length;
  if (fences === wrapped) return;
  return (
    `${slug} has ${fences - wrapped} code fence(s) without a copy button. ` +
    "Clear node_modules/.astro, which caches the stale render."
  );
}

const jsonLdGraph = z.object({
  "@graph": z.array(z.record(z.string(), z.unknown()))
});

function canonicalProblem({ slug, document }: Post) {
  const canonicals = [...document.querySelectorAll('link[rel="canonical"]')].map(
    link => link.getAttribute("href") ?? ""
  );
  const expected = `https://murugappan.dev/blog/${slug}/`;
  if (canonicals.length === 1 && canonicals[0] === expected) return;
  return `${slug} has canonical(s) [${canonicals.join(", ")}], expected exactly ${expected}`;
}

function authorProblem({ slug, document }: Post) {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  if (scripts.length !== 1) {
    return `${slug} has ${scripts.length} JSON-LD blocks, expected one @graph`;
  }
  const graph = jsonLdGraph.parse(JSON.parse(scripts[0].textContent ?? ""))["@graph"];
  const posting = graph.find(node => node["@type"] === "BlogPosting");
  const authorId = z.object({ "@id": z.string() }).safeParse(posting?.author).data?.["@id"];
  const author = graph.find(node => node["@id"] === authorId);
  if (authorId && author?.["@type"] === "Person" && author.name === "Murugappan M") return;
  return `${slug}'s BlogPosting author doesn't resolve to the Person "Murugappan M" in its @graph`;
}

// A markdown render error doesn't fail the build: the glob loader caches the empty result and ships
// a blank article. These checks catch that, and the fence counts also catch a stale cached render.
const POST_CHECKS = [
  emptyBodyProblem,
  titleProblem,
  mermaidProblem,
  copyButtonProblem,
  canonicalProblem,
  authorProblem
];

function checkPost(post: Post) {
  for (const check of POST_CHECKS) {
    const problem = check(post);
    if (problem) throw new Error(`blog-post-checks: ${problem}`);
  }
}

function blogPostChecks(): AstroIntegration {
  return {
    name: "blog-post-checks",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        if (POSTS.length === 0) throw new Error("blog-post-checks: no blog posts checked");
        for (const { slug, markdown } of POSTS) {
          const page = new URL(`blog/${slug}/index.html`, dir);
          if (!fs.existsSync(page)) {
            throw new Error(`blog-post-checks: blog/${slug}/index.html was not built`);
          }
          const { document } = parseHTML(fs.readFileSync(page, "utf8"));
          checkPost({ slug, document, source: markdown });
        }
        logger.info(`${POSTS.length} posts checked`);
      }
    }
  };
}

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
      "astro:build:start": () =>
        run("bun", [fileURLToPath(new URL("scripts/render-mermaid.ts", import.meta.url))]),
      "astro:build:done": ({ dir }) =>
        run("node", [
          fileURLToPath(new URL("scripts/generate-resume.ts", import.meta.url)),
          fileURLToPath(dir)
        ])
    }
  };
}

// config:setup runs before the Fonts API resolves its sources, in dev and build alike.
function firaCodeSubset(): AstroIntegration {
  return {
    name: "fira-code-subset",
    hooks: { "astro:config:setup": () => writeFiraCodeSubset() }
  };
}

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

function modulePreloadHints(): AstroIntegration {
  return {
    name: "module-preload-hints",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        const root = new URL(dir).pathname;
        const addHints = modulePreloader(href => {
          const file = path.join(root, href);
          return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
        });
        const pages = fs
          .readdirSync(root, { recursive: true, withFileTypes: true })
          .filter(entry => entry.isFile() && entry.name.endsWith(".html"))
          .map(entry => path.join(entry.parentPath, entry.name));
        let hinted = 0;
        for (const page of pages) {
          const html = addHints(fs.readFileSync(page, "utf8"));
          if (html === undefined) continue;
          fs.writeFileSync(page, html);
          hinted++;
        }
        logger.info(`modulepreload hints added to ${hinted} page(s)`);
      }
    }
  };
}

const { personalApiKey, projectId } = sourceMapUpload;

export default defineConfig({
  site: SITE_ORIGIN,
  env: { schema: ENV_SCHEMA },
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Fira Code",
      cssVariable: "--font-fira-code",
      // Astro adds a Courier New fallback sized to Fira Code so the swap doesn't rewrap text;
      // "Fira Code metric fallback" (global.css) covers platforms without Courier New.
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
    // An external sheet cost a render-blocking round trip (~150 ms mobile FCP); inlining adds
    // ~14 KB gzipped per page, which is cheaper.
    inlineStylesheets: "always"
  },
  integrations: [
    firaCodeSubset(),
    react(),
    clientInteractionDirective(),
    modulePreloadHints(),
    sitemap({
      filter: page => !/\/(404|outdated)\/?$/.test(page),
      serialize(item) {
        const { pathname } = new URL(item.url);
        if (pathname === "/blog/") {
          item.lastmod = NEWEST_POST;
          return item;
        }
        const slug = pathname.replace(/^\/blog\//, "").replace(/\/$/, "");
        const lastmod = POST_DATES[slug];
        if (lastmod) item.lastmod = lastmod;
        return item;
      }
    }),
    singleFileSitemap(),
    headersFileIntegration(),
    blogPostChecks(),
    // Last, so the site the resume prints from is final.
    buildArtifacts()
  ],
  vite: {
    server: { proxy: { "/blog/audio/": "http://localhost:8787" } },
    build: {
      // CSS gets the vendor prefixes and fallbacks the supported browsers need. JS isn't
      // lowered: Astro pins the client build to esnext.
      cssTarget: BROWSER_TARGETS,
      // 8 KB for CSS only. A plain number would also inline font subsets into
      // the stylesheets (tripled the island sheet). `undefined` keeps the default.
      assetsInlineLimit: (file, content) =>
        file.endsWith(".css") ? content.byteLength < 8192 : undefined
    },
    plugins: [
      contentPosts(),
      tailwindcss(),
      ...(personalApiKey && projectId
        ? [
            posthog({
              personalApiKey,
              projectId,
              sourcemaps: { enabled: true, deleteAfterUpload: true }
            })
          ]
        : [])
    ]
  },
  markdown: {
    // Astro 7's default satteri processor doesn't run unified plugins.
    processor: unified({
      remarkPlugins: [remarkMermaid],
      rehypePlugins: [
        rehypeHeadingIds,
        [rehypeAutolinkHeadings, autolinkConfig],
        [
          rehypeExternalLinks,
          {
            target: "_blank",
            rel: ["noopener", "noreferrer"],
            test: ({ properties: { href } }) =>
              URL.parse(String(href), SITE_ORIGIN)?.origin !== SITE_ORIGIN
          } satisfies ExternalLinksOptions
        ]
      ]
    }),
    // Both themes ride on each span as --shiki-light / --shiki-dark;
    // apps/site/src/styles/blog/code.css picks one per site theme.
    syntaxHighlight: "shiki",
    shikiConfig: { themes: NIGHT_OWL, defaultColor: false, transformers: [copyButton] }
  }
});
