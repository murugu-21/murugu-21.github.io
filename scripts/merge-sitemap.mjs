import { readFileSync, writeFileSync } from "node:fs";

// Merge the blog's generated urlset with the portfolio's single URL into one
// root sitemap at dist/sitemap.xml. Runs after both builds (see build:site).
const blogSitemap = readFileSync("blog/dist/sitemap-0.xml", "utf8");
const urls = blogSitemap.match(/<url>[\s\S]*?<\/url>/g) ?? [];
if (urls.length === 0)
  throw new Error("merge-sitemap: no <url> entries found in blog sitemap");
const portfolio = `<url><loc>https://murugappan.dev/</loc></url>`;
const out =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
  portfolio +
  urls.join("") +
  `</urlset>`;
writeFileSync("dist/sitemap.xml", out);
console.log(`merge-sitemap: wrote dist/sitemap.xml with ${urls.length + 1} URLs`);
