import { Hono, type Context } from "hono";

import type { AppEnv } from "#src/common/app-env.ts";
import { ranksAbove } from "#src/common/http/accept.ts";
import { fetchRendition, serveAsset } from "#src/modules/pages/assets.client.ts";

/**
 * A page answers with its markdown rendition (the `index.md` beside it) when `Accept`
 * ranks markdown above HTML, and with the HTML page otherwise, including when it has no
 * rendition. An HTML page that has one names it in a `Link: rel="alternate"` header.
 */
async function servePage(c: Context<AppEnv>): Promise<Response> {
  const renditionUrl = new URL("index.md", c.req.url);
  if (prefersMarkdown(c)) {
    const rendition = await fetchRendition({ c, url: renditionUrl, probe: false });
    if (rendition.ok || rendition.status === 304) {
      const markdown = varyOnAccept(rendition);
      markdown.headers.set("Content-Type", "text/markdown; charset=utf-8");
      return markdown;
    }
    return varyOnAccept(await serveAsset(c));
  }

  const [page, rendition] = await Promise.all([
    serveAsset(c),
    fetchRendition({ c, url: renditionUrl, probe: true })
  ]);
  const html = varyOnAccept(page);
  // Appended, since _headers may already set Link values for the page.
  if (page.ok && rendition.ok) {
    html.headers.append(
      "Link",
      `<${renditionUrl.pathname}>; rel="alternate"; type="text/markdown"`
    );
  }
  return html;
}

function prefersMarkdown(c: Context): boolean {
  return ranksAbove(c.req.header("Accept"), {
    preferred: ["text/markdown"],
    others: ["text/html", "application/xhtml+xml"]
  });
}

/**
 * Copies the response, since the assets binding's headers are immutable. serveAsset's
 * 404s already vary on Accept, so it is added only when missing.
 */
function varyOnAccept(response: Response): Response {
  const copy = new Response(response.body, response);
  const vary = (copy.headers.get("Vary") ?? "").split(",").map(field => field.trim().toLowerCase());
  if (!vary.includes("accept")) copy.headers.append("Vary", "Accept");
  return copy;
}

/** Mounted last: whatever no other controller claimed. */
export const pagesController = new Hono<AppEnv>();

// Directory URLs are pages and may answer markdown (Hono routes HEAD here too).
// Anything else is an asset or route miss: a content-negotiated 404.
pagesController.get("*", c => (c.req.path.endsWith("/") ? servePage(c) : serveAsset(c)));
pagesController.all("*", c => serveAsset(c));
