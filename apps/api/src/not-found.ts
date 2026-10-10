// Relies on `not_found_handling: "none"` (wrangler.jsonc) so misses reach the Worker, which
// fetches the 404 page itself.

import type { Context } from "hono";

import { SITE_ORIGIN } from "@murugappan/content/site.ts";
import { API_PATHS, VERSIONED_API_BASE } from "@murugappan/contracts/api/routes.ts";

import { ranksAbove } from "./accept";

const ENTRY_POINTS: ReadonlyArray<[string, string]> = [
  ["/sitemap.xml", "Every indexable URL on this site"],
  ["/llms.txt", "One-page summary of the whole site, for LLMs"],
  ["/AGENTS.md", "Agent instructions: when to use this site, and how"],
  ["/developers/", "Developer portal with the murugappan.dev API documentation"],
  ["/openapi.json", "OpenAPI 3.1.0 specification for the API"],
  ["/.well-known/api-catalog", "API catalogue (RFC 9727 linkset)"],
  ["/.well-known/mcp.json", "MCP server manifest (server.json)"],
  ["/mcp", "MCP server, Streamable HTTP, no auth"],
  ["/blog/llms-full.txt", "Full text of every blog post"]
];

const PAGES: ReadonlyArray<[string, string]> = [
  ["/", "Portfolio"],
  ["/about/", "About Murugappan M, the canonical entity page"],
  ["/resume/", "Resume"],
  ["/blog/", "SDE Journey blog"],
  ["/developers/", "Developer portal"]
];

const list = (entries: ReadonlyArray<[string, string]>): string =>
  entries.map(([path, what]) => `- ${what}: ${SITE_ORIGIN}${path}`).join("\n");

/** Absolute URLs, so the body is useful when quoted. */
function notFoundMarkdown(pathname: string): string {
  return `# 404 Not Found

\`${pathname}\` is not a path on murugappan.dev. Nothing was moved. This URL has never been served, so do not retry it.

## Where to look next

${list(ENTRY_POINTS)}

## Pages that do exist

${list(PAGES)}

## The API

Every endpoint under \`${VERSIONED_API_BASE}\` answers JSON and never HTML, including its own 404s. \`GET ${SITE_ORIGIN}${API_PATHS.profile}\` is the cheapest single call for facts about Murugappan M; \`GET ${SITE_ORIGIN}${API_PATHS.openapiRoot}\` is the full contract.
`;
}

const LINK_HEADER = [
  `<${API_PATHS.openapiRoot}>; rel="service-desc"; type="application/json"`,
  `</developers/>; rel="service-doc"; type="text/html"`,
  `</llms.txt>; rel="describedby"; type="text/plain"`,
  `</sitemap.xml>; rel="index"; type="application/xml"`,
  `</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`
].join(", ");

export function markdownNotFound(pathname: string, method: string): Response {
  const body = method === "HEAD" ? null : notFoundMarkdown(pathname);
  return new Response(body, {
    status: 404,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      // The same URL answers HTML for a browser, so caches must key on Accept.
      Vary: "Accept",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      Link: LINK_HEADER
    }
  });
}

/** Falls back to markdown if the 404 page is missing from the build. */
function htmlNotFound(request: Request, response: Response): Response {
  if (!(response.headers.get("Content-Type") ?? "").startsWith("text/html"))
    return markdownNotFound(new URL(request.url).pathname, request.method);

  const html = new Response(request.method === "HEAD" ? null : response.body, response);
  html.headers.set("Vary", "Accept");
  html.headers.set("Link", LINK_HEADER);
  return html;
}

/** A 404 gets markdown unless `Accept` ranks HTML or XHTML highest. */
export async function serveAsset(c: Context<{ Bindings: Env }>): Promise<Response> {
  const request = c.req.raw;
  const response = await c.env.ASSETS.fetch(request);
  if (response.status !== 404) return response;

  const wantsHtml = ranksAbove(c.req.header("Accept"), {
    preferred: ["text/html", "application/xhtml+xml"],
    others: ["text/markdown"]
  });
  return wantsHtml
    ? htmlNotFound(request, await notFoundPage(request, c.env.ASSETS))
    : markdownNotFound(new URL(request.url).pathname, request.method);
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
