// Serves the published posts as `virtual:content/posts`, so the site and the Worker read one
// parse of content/blog. Both builds are Vite, and each loads this plugin.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { parse } from "yaml";

import type { ContentPost } from "#content/posts.ts";
import { BlogFrontmatter } from "#contracts/blog.ts";

const BLOG_DIR = fileURLToPath(new URL("../../content/blog/", import.meta.url));
const MODULE_ID = "virtual:content/posts";
const RESOLVED_ID = `\0${MODULE_ID}`;

// The same split as Astro's glob loader, so `body` matches the content collection's.
const FRONTMATTER = /^---(\n[\s\S]*?\n)---/;

export function parsePost({ slug, markdown }: { slug: string; markdown: string }): ContentPost {
  const raw = FRONTMATTER.exec(markdown)?.[1];
  if (raw === undefined) throw new Error(`content/blog/${slug}/index.md has no frontmatter`);
  const data = BlogFrontmatter.parse(parse(raw));
  return { slug, data, body: markdown.replace(`---${raw}---`, ""), markdown };
}

const postFile = (slug: string) => path.join(BLOG_DIR, slug, "index.md");

/** Each content/blog/<slug>/index.md. Drafts sit one level deeper, under draft/, so they never match. */
export const readPosts = (): ContentPost[] =>
  fs
    .readdirSync(BLOG_DIR)
    .filter(slug => fs.existsSync(postFile(slug)))
    .toSorted()
    .map(slug => parsePost({ slug, markdown: fs.readFileSync(postFile(slug), "utf8") }));

export function contentPosts(): Plugin {
  return {
    name: "content-posts",
    resolveId: id => (id === MODULE_ID ? RESOLVED_ID : undefined),
    load(id) {
      if (id !== RESOLVED_ID) return;
      const posts = readPosts();
      for (const { slug } of posts) this.addWatchFile(postFile(slug));
      const json = JSON.stringify(JSON.stringify(posts));
      return `export const posts = JSON.parse(${json}, (key, value) => key === "date" ? new Date(value) : value);`;
    },
    // addWatchFile covers edits; a post added or deleted under astro dev needs the module rebuilt.
    configureServer(server) {
      const refresh = (file: string) => {
        if (!file.startsWith(BLOG_DIR) || !file.endsWith("index.md")) return;
        const module = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (module) server.moduleGraph.invalidateModule(module);
      };
      server.watcher.on("add", refresh).on("unlink", refresh);
    }
  };
}
