// Well-known discovery documents, so an agent that has never seen this site
// can find its machine-readable surfaces by probing standard locations instead
// of reading prose:
//
//   /.well-known/api-catalog  — RFC 9727, a linkset (RFC 9264) naming every
//                               API here and where each one is described.
//   /.well-known/mcp.json     — the MCP `server.json` document, also served at
//   /mcp.json                   the shorter path clients tend to try first.
//
// Both are generated rather than shipped as static files, so the URLs they
// contain name the host that actually answered.

import {Hono} from "hono";
import {cors} from "hono/cors";

import {publicOrigin} from "./api";
import {API_PATHS, VERSIONED_API_BASE} from "./api/routes";
import {API_VERSION} from "./api/versioning";
import {LATEST_PROTOCOL_VERSION, SERVER_NAME} from "./mcp/protocol";
import {MCP_TOOLS} from "./mcp/tools";

/** RFC 9727 media type for a link set serialised as JSON (RFC 9264). */
export const LINKSET_MEDIA_TYPE = "application/linkset+json";

// The MCP registry requires a reverse-DNS namespace the publisher controls.
export const MCP_SERVER_NAME = "dev.murugappan/murugappan-dev";
export const MCP_SERVER_SCHEMA =
  "https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json";
export const MCP_REPOSITORY =
  "https://github.com/murugu-21/murugu-21.github.io";

const CACHE = "public, max-age=3600";

function document(body: unknown, contentType: string): Response {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": `${contentType}; charset=utf-8`,
      "Cache-Control": CACHE
    }
  });
}

type LinksetTarget = {href: string; type?: string; title?: string};

/**
 * The API catalogue: one context object per API, anchored at the API's own
 * base URL. RFC 9727 requires at least one of `service-desc` or `service-doc`
 * per entry; both are given, plus `service-meta` for the version policy.
 */
export function buildApiCatalog(origin: string): {
  linkset: Array<Record<string, unknown>>;
} {
  const base = origin.replace(/\/$/, "");
  const abs = (path: string): string => `${base}${path}`;
  const target = (
    href: string,
    type: string,
    title: string
  ): LinksetTarget => ({href, type, title});

  return {
    linkset: [
      {
        anchor: abs(VERSIONED_API_BASE),
        "service-desc": [
          target(
            abs(API_PATHS.openapiRoot),
            "application/json",
            "murugappan.dev API — OpenAPI 3.1.0 specification"
          )
        ],
        "service-doc": [
          target(
            abs("/developers/"),
            "text/html",
            "murugappan.dev API — developer portal"
          )
        ],
        "service-meta": [
          target(
            abs(API_PATHS.versions),
            "application/json",
            "murugappan.dev API — version and deprecation policy"
          )
        ],
        describedby: [
          target(
            abs("/AGENTS.md"),
            "text/markdown",
            "murugappan.dev — agent instructions"
          )
        ],
        status: [
          target(
            abs("/developers/#versioning"),
            "text/html",
            "murugappan.dev API — versioning and deprecation status"
          )
        ],
        author: [{href: abs("/about/"), title: "Murugappan M"}]
      },
      {
        anchor: abs("/mcp"),
        "service-desc": [
          target(
            abs("/.well-known/mcp.json"),
            "application/json",
            "murugappan.dev MCP server — server.json manifest"
          )
        ],
        "service-doc": [
          target(
            abs("/developers/#mcp"),
            "text/html",
            "murugappan.dev MCP server — documentation"
          )
        ],
        describedby: [
          target(
            abs("/AGENTS.md"),
            "text/markdown",
            "murugappan.dev — agent instructions"
          )
        ],
        author: [{href: abs("/about/"), title: "Murugappan M"}]
      }
    ]
  };
}

/**
 * The MCP `server.json` manifest. Fields and their names come from the
 * published schema; the tool list rides in `_meta` under a reverse-DNS key,
 * which is the only place the schema allows extra data.
 */
export function buildMcpManifest(origin: string): Record<string, unknown> {
  const base = origin.replace(/\/$/, "");
  return {
    $schema: MCP_SERVER_SCHEMA,
    name: MCP_SERVER_NAME,
    // The schema caps this at 100 characters.
    description:
      "First-party facts about Murugappan M: profile, experience, skills, writing, and a way to reach him.",
    version: API_VERSION,
    websiteUrl: `${base}/developers/#mcp`,
    repository: {url: MCP_REPOSITORY, source: "github"},
    remotes: [{type: "streamable-http", url: `${base}/mcp`}],
    _meta: {
      "dev.murugappan/server": {
        transport: "streamable-http",
        authentication: "none",
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverName: SERVER_NAME,
        tools: MCP_TOOLS.map(tool => tool.name),
        documentation: `${base}/developers/#mcp`,
        openapi: `${base}${API_PATHS.openapiRoot}`
      }
    }
  };
}

const READ: string[] = ["GET", "HEAD"];

/** Mounted at /.well-known — see server.ts. */
export const wellKnown = new Hono<{Bindings: Env}>();

wellKnown.use(
  "*",
  cors({origin: "*", allowMethods: ["GET", "HEAD", "OPTIONS"], maxAge: 86400})
);

wellKnown.on(READ, "/api-catalog", c =>
  document(buildApiCatalog(publicOrigin(c.req.url)), LINKSET_MEDIA_TYPE)
);

wellKnown.on(READ, "/mcp.json", c =>
  document(buildMcpManifest(publicOrigin(c.req.url)), "application/json")
);

/** The same manifest at the site root, which is where clients look first. */
export const mcpManifest = new Hono<{Bindings: Env}>();

mcpManifest.use(
  "*",
  cors({origin: "*", allowMethods: ["GET", "HEAD", "OPTIONS"], maxAge: 86400})
);

mcpManifest.on(READ, "/", c =>
  document(buildMcpManifest(publicOrigin(c.req.url)), "application/json")
);
