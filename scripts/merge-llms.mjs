import { readFileSync, writeFileSync } from "node:fs";

// Append the blog's post list (from the blog app's generated llms.txt) to the
// root llms.txt so the site's root LLM map covers all content. Runs last in build:site.
const root = readFileSync("dist/llms.txt", "utf8").trimEnd();
const blogLlms = readFileSync("blog/dist/llms.txt", "utf8");
const postLines = blogLlms.split("\n").filter((l) => l.startsWith("- ["));
if (postLines.length === 0) throw new Error("merge-llms: no post links found in blog llms.txt");
const out = root + "\n\n## Blog posts\n" + postLines.join("\n") + "\n";
writeFileSync("dist/llms.txt", out);
console.log(`merge-llms: appended ${postLines.length} blog posts to root llms.txt`);
