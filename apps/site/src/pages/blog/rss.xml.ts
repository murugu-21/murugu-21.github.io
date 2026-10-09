import rss from "@astrojs/rss";
import type { ImageMetadata } from "astro";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";

import { postDescription, postUrl } from "@murugappan/content/posts.ts";
import { BLOG_DESCRIPTION, BLOG_TITLE, SITE_ORIGIN } from "@murugappan/content/site.ts";
import { getPostSources } from "#src/lib/blog/posts.ts";
import { replaceMermaidFences } from "#src/lib/blog/mermaid-diagrams.ts";
import { BLOG_URL } from "#src/lib/site.ts";

// html: true so inline HTML in a post (<sup>) reaches readers; sanitize-html drops the unsafe tags.
const parser = new MarkdownIt({ html: true });

// Feed readers need absolute image URLs; importing post images here yields
// their hashed, emitted public paths.
const assets = import.meta.glob<{ default: ImageMetadata | string }>(
  "../../../../../packages/content/blog/**/*.{jpg,jpeg,png,gif,webp,svg}",
  { eager: true }
);
const ASSET_URLS = new Map(
  Object.entries(assets).map(([file, mod]) => {
    const asset = mod.default;
    return [
      file.replace("../../../../../packages/content/blog/", ""),
      SITE_ORIGIN + (typeof asset === "string" ? asset : asset.src)
    ];
  })
);

// Rewrites relative <img src> only; absolute, root-relative and anchor URLs pass through.
function absolutizeAssets(html: string, postId: string): string {
  return html.replaceAll(
    /(<img\b[^>]*?\bsrc=")([^"]+)(?=")/gi,
    (match: string, before: string, url: string) => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(url)) return match;
      const resolved = ASSET_URLS.get(`${postId}/${url.replace(/^\.\//, "")}`);
      return resolved ? before + resolved : match;
    }
  );
}

// This route uses markdown-it, not the remark pipeline, so ```mermaid fences are
// swapped for their light-theme PNGs here: feed readers have no theme toggle and
// their image proxies can't rasterize SVG (see diagramRaster).
export async function GET() {
  const posts = await getPostSources();

  const items = await Promise.all(
    posts.map(async post => ({
      title: post.data.title,
      pubDate: post.data.date,
      link: postUrl(post.slug),
      description: postDescription(post),
      content: absolutizeAssets(
        sanitizeHtml(parser.render(await replaceMermaidFences(post.body)), {
          allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"])
        }),
        post.slug
      )
    }))
  );

  return rss({
    title: `${BLOG_TITLE} RSS Feed`,
    description: BLOG_DESCRIPTION,
    site: BLOG_URL,
    items
  });
}
