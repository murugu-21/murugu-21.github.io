import { API_PATHS, VERSIONED_API_BASE } from "./api/routes";
import { BLOG_TITLE } from "./blog.ts";

type Rel =
  | "describedby"
  | "service-desc"
  | "service-doc"
  | "api-catalog"
  | "version-history"
  | "latest-version"
  | "author"
  | "alternate"
  | "index"
  | "deprecation"
  | "successor-version";

export type SurfaceDocument = {
  /** Site-relative. Each consumer prefixes its own origin. */
  path: `/${string}`;
  /** Absent on a link to a page or a path prefix, which no single media type describes. */
  type?: string;
  /** The one title every list, catalog entry and resource descriptor shows. */
  title: string;
  rel: Rel;
};

export const DOCUMENTS = {
  llms: {
    path: "/llms.txt",
    type: "text/plain",
    title: "Site summary for LLMs",
    rel: "describedby"
  },
  agentGuide: {
    path: "/AGENTS.md",
    type: "text/markdown",
    title: "Agent instructions for murugappan.dev",
    rel: "describedby"
  },
  openapi: {
    path: API_PATHS.openapiRoot,
    type: "application/json",
    title: "OpenAPI 3.1.0 specification for the murugappan.dev API",
    rel: "service-desc"
  },
  developers: {
    path: "/developers/",
    type: "text/html",
    title: "Developer portal for the murugappan.dev API",
    rel: "service-doc"
  },
  versions: {
    path: API_PATHS.versions,
    type: "application/json",
    title: "Version and deprecation policy for the murugappan.dev API",
    rel: "version-history"
  },
  latestVersion: {
    path: VERSIONED_API_BASE,
    title: "Base path of the current API version",
    rel: "latest-version"
  },
  apiCatalog: {
    path: "/.well-known/api-catalog",
    type: "application/linkset+json",
    title: "API catalogue (RFC 9727 linkset)",
    rel: "api-catalog"
  },
  mcpManifest: {
    path: "/.well-known/mcp.json",
    type: "application/json",
    title: "server.json manifest for the murugappan.dev MCP server",
    rel: "service-desc"
  },
  sitemap: {
    path: "/sitemap.xml",
    type: "application/xml",
    title: "Every indexable URL on this site",
    rel: "index"
  },
  rss: {
    path: "/blog/rss.xml",
    type: "application/rss+xml",
    title: `${BLOG_TITLE} RSS Feed`,
    rel: "alternate"
  },
  llmsFull: {
    path: "/blog/llms-full.txt",
    type: "text/plain",
    title: "Full text of every blog post",
    rel: "describedby"
  },
  about: { path: "/about/", title: "Murugappan M", rel: "author" }
} as const satisfies Record<string, SurfaceDocument>;

export type DocumentKey = keyof typeof DOCUMENTS;

/** Surfaces the assets layer serves, whose Link header comes from the generated `_headers`. */
export const STATIC_SURFACES = ["/", "/about/", "/developers/", "/AGENTS.md", "/llms.txt"] as const;
export type StaticSurface = (typeof STATIC_SURFACES)[number];

/** Where a Link header or `<link>` tag is emitted: a static surface, or one the Worker answers. */
export type Surface = StaticSurface | "api" | "notFound";

/** The documents each surface links to, in header order. The order is the public contract. */
export const LINKS: Record<Surface, readonly DocumentKey[]> = {
  "/": ["llms", "about", "rss", "openapi", "developers", "apiCatalog"],
  "/about/": ["llms", "openapi", "developers", "apiCatalog"],
  "/developers/": ["openapi", "agentGuide", "llms", "apiCatalog", "versions"],
  "/AGENTS.md": ["openapi", "developers", "apiCatalog"],
  "/llms.txt": ["openapi", "developers", "apiCatalog"],
  api: ["openapi", "developers", "versions", "latestVersion", "apiCatalog"],
  notFound: ["openapi", "developers", "llms", "sitemap", "apiCatalog"]
};

/** What the 404 body, the agent guide and llms.txt list, in this order. */
export const ENTRY_POINTS: readonly DocumentKey[] = [
  "sitemap",
  "llms",
  "agentGuide",
  "developers",
  "openapi",
  "versions",
  "apiCatalog",
  "mcpManifest",
  "rss",
  "llmsFull"
];
