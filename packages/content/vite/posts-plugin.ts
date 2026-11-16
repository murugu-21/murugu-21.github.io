import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { parse } from "yaml";

import type { ContentPost } from "@murugappan/content/posts.ts";
import { BlogFrontmatter } from "@murugappan/contracts/blog.ts";
import { ifPresent } from "@murugappan/utils/node/fs.ts";

const BLOG_DIR = fileURLToPath(new URL("../blog/", import.meta.url));
const MODULE_ID = "virtual:content/posts";
const RESOLVED_ID = `\0${MODULE_ID}`;

const FRONTMATTER = /^---(\n[\s\S]*?\n)---/;

export function parsePost({ slug, markdown }: { slug: string; markdown: string }): ContentPost {
  const raw = FRONTMATTER.exec(markdown)?.[1];
  if (raw === undefined)
    throw new Error(`packages/content/blog/${slug}/index.md has no frontmatter`);
  const data = BlogFrontmatter.parse(parse(raw));
  return { slug, data, body: markdown.replace(`---${raw}---`, ""), markdown };
}

const postFile = (slug: string) => path.join(BLOG_DIR, slug, "index.md");

export async function readPosts(): Promise<ContentPost[]> {
  const slugs = (await readdir(BLOG_DIR)).toSorted();
  const posts = await Promise.all(
    slugs.map(async slug => {
      const markdown = await ifPresent(readFile(postFile(slug), "utf8"));
      return markdown === undefined ? [] : [parsePost({ slug, markdown })];
    })
  );
  return posts.flat();
}

export function contentPosts(): Plugin {
  return {
    name: "content-posts",
    resolveId: id => (id === MODULE_ID ? RESOLVED_ID : undefined),
    async load(id) {
      if (id !== RESOLVED_ID) return;
      const posts = await readPosts();
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
