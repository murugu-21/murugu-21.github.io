// Content-negotiated 404: the styled page for a browser, a markdown list of
// entry points for everything else. Relies on `not_found_handling: "none"`
// (wrangler.jsonc) so misses reach the Worker, which fetches the 404 page itself.

import { API_PATHS, VERSIONED_API_BASE } from "#contracts/api/routes.ts";

const SITE_ORIGIN = "https://murugappan.dev";

/** Markdown unless the client asks for HTML; no Accept or a wildcard gets markdown. */
export function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return true;
  const lower = accept.toLowerCase();
  if (lower.includes("text/markdown")) return true;
  if (lower.includes("text/html") || lower.includes("application/xhtml+xml")) return false;
  return true;
}

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

/** `method` is honoured so a HEAD gets no body. */
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

type AssetsLike = { fetch(request: Request): Promise<Response> };

/** Falls back to markdown if the 404 page is missing from the build. */
function htmlNotFound(request: Request, response: Response): Response {
  if (!(response.headers.get("Content-Type") ?? "").startsWith("text/html"))
    return markdownNotFound(new URL(request.url).pathname, request.method);

  const html = new Response(request.method === "HEAD" ? null : response.body, response);
  html.headers.set("Vary", "Accept");
  html.headers.set("Link", LINK_HEADER);
  return html;
}

/** Serves from static assets; only a 404 is rewritten. */
export async function serveAsset(request: Request, assets: AssetsLike): Promise<Response> {
  const response = await assets.fetch(request);
  if (response.status !== 404) return response;

  const { pathname } = new URL(request.url);
  return prefersMarkdown(request.headers.get("Accept"))
    ? markdownNotFound(pathname, request.method)
    : htmlNotFound(request, await notFoundPage(request, assets));
}

// The blog's 404 under /blog/, the site's elsewhere. Fetched as GET (the HEAD
// body is dropped later) and re-statused 404, since the binding answers it 200.
async function notFoundPage(request: Request, assets: AssetsLike): Promise<Response> {
  const { pathname } = new URL(request.url);
  const page = pathname === "/blog" || pathname.startsWith("/blog/") ? "/blog/404/" : "/404";
  const res = await assets.fetch(
    new Request(new URL(page, request.url), { headers: request.headers })
  );
  return new Response(res.body, { status: 404, headers: res.headers });
}
