// The 404 bodies: markdown for agents and curl, the site's HTML page for browsers.

import { SITE_ORIGIN } from "@murugappan/content/site.ts";
import { API_PATHS, VERSIONED_API_BASE } from "@murugappan/contracts/api/routes.ts";

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

export function markdownNotFound({
  pathname,
  method
}: {
  pathname: string;
  method: string;
}): Response {
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
export function htmlNotFound(request: Request, response: Response): Response {
  if (!(response.headers.get("Content-Type") ?? "").startsWith("text/html"))
    return markdownNotFound({ pathname: new URL(request.url).pathname, method: request.method });

  const html = new Response(request.method === "HEAD" ? null : response.body, response);
  html.headers.set("Vary", "Accept");
  html.headers.set("Link", LINK_HEADER);
  return html;
}
