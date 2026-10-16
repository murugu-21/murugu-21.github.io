import { SITE_ORIGIN } from "@murugappan/content/site.ts";
import { entryPoints, linkHeader } from "@murugappan/content/surface.ts";
import { API_PATHS, VERSIONED_API_BASE } from "@murugappan/contracts/api/routes.ts";

const PAGES: ReadonlyArray<[string, string]> = [
  ["/", "Portfolio"],
  ["/about/", "About Murugappan M, the canonical entity page"],
  ["/resume/", "Resume"],
  ["/blog/", "SDE Journey blog"],
  ["/developers/", "Developer portal"]
];

const list = (entries: ReadonlyArray<[string, string]>): string =>
  entries.map(([path, what]) => `- [${what}](${SITE_ORIGIN}${path})`).join("\n");

function notFoundMarkdown(pathname: string): string {
  return `# 404 Not Found

\`${pathname}\` is not a path on murugappan.dev. Nothing was moved. This URL has never been served, so do not retry it.

## Where to look next

${entryPoints()}
- [MCP server, Streamable HTTP, no auth](${SITE_ORIGIN}/mcp)

## Pages that do exist

${list(PAGES)}

## The API

Every endpoint under \`${VERSIONED_API_BASE}\` answers JSON and never HTML, including its own 404s. \`GET ${SITE_ORIGIN}${API_PATHS.profile}\` is the cheapest single call for facts about Murugappan M; \`GET ${SITE_ORIGIN}${API_PATHS.openapiRoot}\` is the full contract.
`;
}

const LINK_HEADER = linkHeader("notFound");

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
      Vary: "Accept",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      Link: LINK_HEADER
    }
  });
}

export function htmlNotFound(request: Request, response: Response): Response {
  if (!(response.headers.get("Content-Type") ?? "").startsWith("text/html"))
    return markdownNotFound({ pathname: new URL(request.url).pathname, method: request.method });

  const html = new Response(request.method === "HEAD" ? null : response.body, response);
  html.headers.set("Vary", "Accept");
  html.headers.set("Link", LINK_HEADER);
  return html;
}
