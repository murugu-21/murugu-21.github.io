// Spec: RFC 9727 api-catalog.
import { API_PATHS, VERSIONED_API_BASE } from "@murugappan/contracts/api/routes.ts";
import { API_VERSION } from "@murugappan/contracts/api/versioning.ts";
import { developersSection } from "@murugappan/content/surface.ts";
import {
  LATEST_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_SCHEMA,
  MCP_TOOLS,
  SERVER_NAME
} from "@murugappan/contracts/mcp.ts";
import { DOCUMENTS, type SurfaceDocument } from "@murugappan/contracts/surface.ts";

const MCP_REPOSITORY = "https://github.com/murugu-21/murugu-21.github.io";

type LinkTarget = { href: string; type?: string; title: string };
type LinksetEntry = { anchor: string } & Partial<
  Record<
    "service-desc" | "service-doc" | "service-meta" | "describedby" | "status" | "author",
    LinkTarget[]
  >
>;
type Linkset = { linkset: LinksetEntry[] };

/** RFC 9727 requires `service-desc` or `service-doc` per entry. */
export function buildApiCatalog(origin: string): Linkset {
  const abs = (path: string): string => `${origin}${path}`;
  const target = ({ path, type, title }: SurfaceDocument): LinkTarget => ({
    href: abs(path),
    type,
    title
  });

  return {
    linkset: [
      {
        anchor: abs(VERSIONED_API_BASE),
        "service-desc": [target(DOCUMENTS.openapi)],
        "service-doc": [target(DOCUMENTS.developers)],
        "service-meta": [target(DOCUMENTS.versions)],
        describedby: [target(DOCUMENTS.agentGuide)],
        status: [
          target({
            ...developersSection("versioning"),
            title: "Versioning and deprecation status for the murugappan.dev API"
          })
        ],
        author: [target(DOCUMENTS.about)]
      },
      {
        anchor: abs("/mcp"),
        "service-desc": [target(DOCUMENTS.mcpManifest)],
        "service-doc": [
          target({
            ...developersSection("mcp"),
            title: "Documentation for the murugappan.dev MCP server"
          })
        ],
        describedby: [target(DOCUMENTS.agentGuide)],
        author: [target(DOCUMENTS.about)]
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
