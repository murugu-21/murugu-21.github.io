// /.well-known/api-catalog (RFC 9727) and the MCP server.json, also at /mcp.json.
// Generated per request so their URLs name the host that answered.

import { Hono } from "hono";
import { cors } from "hono/cors";

import { publicOrigin } from "./api";
import { API_PATHS, READ_METHODS, VERSIONED_API_BASE } from "#contracts/api/routes.ts";
import { API_VERSION } from "#contracts/api/versioning.ts";
import {
  LATEST_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_SCHEMA,
  MCP_TOOLS,
  SERVER_NAME
} from "#contracts/mcp.ts";

/** RFC 9727 media type for a link set serialised as JSON (RFC 9264). */
export const LINKSET_MEDIA_TYPE = "application/linkset+json";

const MCP_REPOSITORY = "https://github.com/murugu-21/murugu-21.github.io";

const CACHE = "public, max-age=3600";

function document(body: unknown, contentType: string): Response {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": `${contentType}; charset=utf-8`,
      "Cache-Control": CACHE
    }
  });
}

type LinkTarget = { href: string; type?: string; title: string };
type LinksetEntry = { anchor: string } & Partial<
  Record<
    "service-desc" | "service-doc" | "service-meta" | "describedby" | "status" | "author",
    LinkTarget[]
  >
>;

/** RFC 9727 requires `service-desc` or `service-doc` per entry. */
export function buildApiCatalog(origin: string): { linkset: LinksetEntry[] } {
  const abs = (path: string): string => `${origin}${path}`;
  const target = ({ path, type, title }: { path: string; type: string; title: string }) => ({
    href: abs(path),
    type,
    title
  });
  const agentInstructions = target({
    path: "/AGENTS.md",
    type: "text/markdown",
    title: "Agent instructions for murugappan.dev"
  });
  const author = { href: abs("/about/"), title: "Murugappan M" };

  return {
    linkset: [
      {
        anchor: abs(VERSIONED_API_BASE),
        "service-desc": [
          target({
            path: API_PATHS.openapiRoot,
            type: "application/json",
            title: "OpenAPI 3.1.0 specification for the murugappan.dev API"
          })
        ],
        "service-doc": [
          target({
            path: "/developers/",
            type: "text/html",
            title: "Developer portal for the murugappan.dev API"
          })
        ],
        "service-meta": [
          target({
            path: API_PATHS.versions,
            type: "application/json",
            title: "Version and deprecation policy for the murugappan.dev API"
          })
        ],
        describedby: [agentInstructions],
        status: [
          target({
            path: "/developers/#versioning",
            type: "text/html",
            title: "Versioning and deprecation status for the murugappan.dev API"
          })
        ],
        author: [author]
      },
      {
        anchor: abs("/mcp"),
        "service-desc": [
          target({
            path: "/.well-known/mcp.json",
            type: "application/json",
            title: "server.json manifest for the murugappan.dev MCP server"
          })
        ],
        "service-doc": [
          target({
            path: "/developers/#mcp",
            type: "text/html",
            title: "Documentation for the murugappan.dev MCP server"
          })
        ],
        describedby: [agentInstructions],
        author: [author]
      }
    ]
  };
}

/** The tool list goes in `_meta`, the only place the schema allows extra data. */
export function buildMcpManifest(origin: string) {
  return {
    $schema: MCP_SERVER_SCHEMA,
    name: MCP_SERVER_NAME,
    // The schema caps this at 100 characters.
    description:
      "First-party facts about Murugappan M: profile, experience, skills, writing, and a way to reach him.",
    version: API_VERSION,
    websiteUrl: `${origin}/developers/#mcp`,
    repository: { url: MCP_REPOSITORY, source: "github" },
    remotes: [{ type: "streamable-http", url: `${origin}/mcp` }],
    _meta: {
      "dev.murugappan/server": {
        transport: "streamable-http",
        authentication: "none",
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverName: SERVER_NAME,
        tools: MCP_TOOLS.map(tool => tool.name),
        documentation: `${origin}/developers/#mcp`,
        openapi: `${origin}${API_PATHS.openapiRoot}`
      }
    }
  };
}

const readCors = cors({ origin: "*", allowMethods: ["GET", "HEAD", "OPTIONS"], maxAge: 86400 });

export const wellKnown = new Hono<{ Bindings: Env }>();

wellKnown.use("*", readCors);

wellKnown.on(READ_METHODS, "/api-catalog", c =>
  document(buildApiCatalog(publicOrigin(c.req.url)), LINKSET_MEDIA_TYPE)
);

const manifestResponse = (requestUrl: string) =>
  document(buildMcpManifest(publicOrigin(requestUrl)), "application/json");

wellKnown.on(READ_METHODS, "/mcp.json", c => manifestResponse(c.req.url));

/** The same manifest at the site root, where clients look first. */
export const mcpManifest = new Hono<{ Bindings: Env }>();

mcpManifest.use("*", readCors);

mcpManifest.on(READ_METHODS, "/", c => manifestResponse(c.req.url));
