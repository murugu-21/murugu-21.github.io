// The 404 an agent can act on.
//
// A path that does not exist has always answered a real 404 here, but the body
// was the styled HTML page — nothing a non-browser client can read. Now the
// response is content-negotiated: a browser still gets the page, and everything
// else gets a short markdown body naming the sitemap, the machine-readable
// entry points and the pages that do exist, which is enough to recover from a
// guessed or stale URL without a second request.
//
// This is why `assets.run_worker_first` covers "/*" (see wrangler.jsonc): left
// to itself, the assets layer answers every miss from `not_found_handling` and
// the Worker is never invoked, so there would be nowhere to negotiate. Running
// first changes nothing else about asset serving — `ASSETS.fetch()` still
// applies _headers, _redirects and html_handling.

import {API_PATHS, VERSIONED_API_BASE} from "./api/routes";

export const SITE_ORIGIN = "https://murugappan.dev";

/**
 * Whether to answer with markdown rather than the HTML page. A client that
 * asks for HTML gets HTML; everything else — no Accept header at all, `*​/*`
 * from curl and the fetch default, an explicit `text/markdown` — gets markdown,
 * because for those the styled page is strictly less useful than a list of
 * links.
 */
export function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return true;
  const lower = accept.toLowerCase();
  if (lower.includes("text/markdown")) return true;
  if (lower.includes("text/html") || lower.includes("application/xhtml+xml"))
    return false;
  return true;
}

const ENTRY_POINTS: ReadonlyArray<[string, string]> = [
  ["/sitemap.xml", "Every indexable URL on this site"],
  ["/llms.txt", "One-page summary of the whole site, for LLMs"],
  ["/AGENTS.md", "Agent instructions: when to use this site, and how"],
  ["/developers/", "Developer portal — murugappan.dev API documentation"],
  ["/openapi.json", "OpenAPI 3.1.0 specification for the API"],
  ["/.well-known/api-catalog", "API catalogue (RFC 9727 linkset)"],
  ["/.well-known/mcp.json", "MCP server manifest (server.json)"],
  ["/mcp", "MCP server, Streamable HTTP, no auth"],
  ["/blog/llms-full.txt", "Full text of every blog post"]
];

const PAGES: ReadonlyArray<[string, string]> = [
  ["/", "Portfolio"],
  ["/about/", "About Murugappan M — the canonical entity page"],
  ["/resume/", "Resume"],
  ["/blog/", "SDE Journey blog"],
  ["/developers/", "Developer portal"]
];

const list = (entries: ReadonlyArray<[string, string]>): string =>
  entries.map(([path, what]) => `- ${what}: ${SITE_ORIGIN}${path}`).join("\n");

/** The markdown body of a 404. Absolute URLs, so it is useful when quoted. */
export function notFoundMarkdown(pathname: string): string {
  return `# 404 Not Found

\`${pathname}\` is not a path on murugappan.dev. Nothing was moved — this URL has never been served, so do not retry it.

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

/**
 * A 404 whose body is markdown. `method` is honoured so a HEAD gets the
 * headers without a body, as the HTTP spec requires.
 */
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

type AssetsLike = {fetch(request: Request): Promise<Response>};

/**
 * The styled page the assets layer produced, with the negotiation declared and
 * the same Link relations the markdown body carries. If the response is not
 * HTML — `not_found_handling` misconfigured, or the page missing from the build
 * — markdown is better than an empty body, so that is what a client gets.
 */
function htmlNotFound(request: Request, response: Response): Response {
  if (!(response.headers.get("Content-Type") ?? "").startsWith("text/html"))
    return markdownNotFound(new URL(request.url).pathname, request.method);

  const html = new Response(
    request.method === "HEAD" ? null : response.body,
    response
  );
  // The same URL answers markdown for a machine client, so caches must key on
  // Accept. Everything else about the response is left exactly as served.
  html.headers.set("Vary", "Accept");
  html.headers.set("Link", LINK_HEADER);
  return html;
}

/**
 * Serve `request` from static assets, answering a miss with the negotiated 404.
 * Any other status — a hit, a redirect from _redirects, a 304 — is passed
 * through untouched.
 */
export async function serveAsset(
  request: Request,
  assets: AssetsLike
): Promise<Response> {
  const response = await assets.fetch(request);
  if (response.status !== 404) return response;

  return prefersMarkdown(request.headers.get("Accept"))
    ? markdownNotFound(new URL(request.url).pathname, request.method)
    : htmlNotFound(request, response);
}
