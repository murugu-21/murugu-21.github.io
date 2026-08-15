import {readFileSync, writeFileSync, existsSync, readdirSync} from "node:fs";

// Build-time markdown renditions for Accept: text/markdown content
// negotiation (served by worker/markdown.ts). One index.md next to each
// negotiable page's index.html. Runs after merge-llms (needs the merged
// root llms.txt) in build:site.

// Homepage + /about (canonical entity page): the merged root llms.txt
// already is the site's markdown identity summary — serve it for both.
writeFileSync("dist/index.md", readFileSync("dist/llms.txt", "utf8"));
writeFileSync("dist/about/index.md", readFileSync("dist/llms.txt", "utf8"));

// Blog posts: ship the real markdown source, frontmatter included (same
// shape as Cloudflare's converter output). Gate on the built HTML so drafts
// or renamed dirs never leak.
let posts = 0;
for (const slug of readdirSync("blog/content/blog")) {
  const src = `blog/content/blog/${slug}/index.md`;
  if (!existsSync(src) || !existsSync(`dist/blog/${slug}/index.html`)) continue;
  writeFileSync(`dist/blog/${slug}/index.md`, readFileSync(src, "utf8"));
  posts++;
}
if (posts === 0)
  throw new Error("generate-markdown: no blog post markdown written");

// Blog index: reuse the post list the blog build wrote into its llms.txt.
const postLines = readFileSync("blog/dist/llms.txt", "utf8")
  .split("\n")
  .filter(l => l.startsWith("- ["));
if (postLines.length === 0)
  throw new Error("generate-markdown: no post links found in blog llms.txt");
writeFileSync(
  "dist/blog/index.md",
  `# SDE Journey\n\n> A Technical blog on my experiences in the tech industry\n\n## Posts\n${postLines.join("\n")}\n`
);
console.log(
  `generate-markdown: wrote homepage + blog index + ${posts} post index.md files`
);
