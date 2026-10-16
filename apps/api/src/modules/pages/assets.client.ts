// Relies on `not_found_handling: "none"` (wrangler.jsonc) so misses reach the Worker, which
// fetches the 404 page itself.

import type { Context } from "hono";

import type { AppEnv } from "#src/common/app-env.ts";
import { ranksAbove } from "#src/common/http/accept.ts";
import { htmlNotFound, markdownNotFound } from "#src/modules/pages/not-found.ts";

/**
 * A page's `index.md` rendition. A probe is a HEAD; otherwise the client's request rides along
 * with its conditional headers, so the binding may answer 304.
 */
export function fetchRendition({
  c,
  url,
  probe
}: {
  c: Context<AppEnv>;
  url: URL;
  probe: boolean;
}): Promise<Response> {
  const request = probe ? new Request(url, { method: "HEAD" }) : new Request(url, c.req.raw);
  return c.env.ASSETS.fetch(request);
}

export async function serveAsset(c: Context<AppEnv>): Promise<Response> {
  const request = c.req.raw;
  const response = await c.env.ASSETS.fetch(request);
  if (response.status !== 404) return response;

  const wantsHtml = ranksAbove(c.req.header("Accept"), {
    preferred: ["text/html", "application/xhtml+xml"],
    others: ["text/markdown"]
  });
  return wantsHtml
    ? htmlNotFound(request, await notFoundPage(request, c.env.ASSETS))
    : markdownNotFound({ pathname: new URL(request.url).pathname, method: request.method });
}

// The blog's 404 under /blog/, the site's elsewhere. Fetched as GET (the HEAD
// body is dropped later) and re-statused 404, since the binding answers it 200.
// Unconditionally, or a cached copy's ETag would turn it into an empty 304.
async function notFoundPage(request: Request, assets: Fetcher): Promise<Response> {
  const { pathname } = new URL(request.url);
  const page = pathname === "/blog" || pathname.startsWith("/blog/") ? "/blog/404/" : "/404";
  const headers = new Headers(request.headers);
  headers.delete("If-None-Match");
  const res = await assets.fetch(new Request(new URL(page, request.url), { headers }));
  return new Response(res.body, { status: 404, headers: res.headers });
}
