import { linkHeader } from "@murugappan/content/surface.ts";
import { DOCUMENTS, STATIC_SURFACES, type StaticSurface } from "@murugappan/contracts/surface.ts";

type HeaderFields = Record<string, string>;
type Block = [path: string, headers: HeaderFields];

const AGENT_DOCUMENT_CACHE = "public, max-age=3600";

const DOCUMENT_HEADERS: Partial<Record<StaticSurface, HeaderFields>> = {
  "/AGENTS.md": {
    "Content-Type": `${DOCUMENTS.agentGuide.type}; charset=utf-8`,
    "Cache-Control": AGENT_DOCUMENT_CACHE
  },
  "/llms.txt": { "Cache-Control": AGENT_DOCUMENT_CACHE }
};

const ASSET_HEADERS: readonly Block[] = [
  ["/static/*", { "Cache-Control": "public, max-age=31536000, immutable" }],
  // Served by extension as application/xml otherwise.
  [DOCUMENTS.rss.path, { "Content-Type": `${DOCUMENTS.rss.type}; charset=utf-8` }],
  ["/resume/index.md", { "X-Robots-Tag": "noindex" }],
  [
    "/*",
    {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY"
    }
  ]
];

const block = ([path, headers]: Block): string =>
  [path, ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`)].join("\n");

/** The Cloudflare `_headers` file: https://developers.cloudflare.com/workers/static-assets/headers/ */
export const headersFile = (): string => {
  const blocks: readonly Block[] = [
    ...STATIC_SURFACES.map((surface): Block => [
      surface,
      { ...DOCUMENT_HEADERS[surface], Link: linkHeader(surface) }
    ]),
    ...ASSET_HEADERS
  ];
  return `${blocks.map(block).join("\n\n")}\n`;
};
