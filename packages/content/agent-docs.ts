import {
  CONTACT_DAILY_GLOBAL,
  CONTACT_DAILY_PER_CLIENT
} from "@murugappan/contracts/api/contact.ts";
import {
  CONTACT_POLICY,
  READ_CACHE_MINUTES,
  READ_POLICY,
  READ_QUOTA
} from "@murugappan/contracts/api/quotas.ts";
import { DEPRECATION_NOTICE_DAYS } from "@murugappan/contracts/api/versioning.ts";
import {
  LATEST_PROTOCOL_VERSION,
  LEGACY_PROTOCOL_VERSIONS,
  MCP_RESOURCES,
  MCP_TOOLS
} from "@murugappan/contracts/mcp.ts";
import { DOCUMENTS } from "@murugappan/contracts/surface.ts";
import { WEBMCP_TOOL_NAMES } from "@murugappan/contracts/webmcp.ts";
import GUIDE from "./agent-guide.md?raw";
import MCP_VALIDATION_ERROR from "./generated/mcp-validation-error.txt?raw";
import LLMS_PREAMBLE from "./llms-preamble.txt?raw";
import { andList } from "./site.ts";
import { entryPoints } from "./surface.ts";

const code = (text: string) => `\`${text}\``;

type ToolRow = { tool: string; what: string };

function toolTable(): string {
  const header: ToolRow = { tool: "Tool", what: "What it does" };
  const rows = MCP_TOOLS.map((tool): ToolRow => ({
    tool: code(tool.name),
    what: tool.guideSummary
  }));
  const width = (key: keyof ToolRow) => Math.max(...[header, ...rows].map(row => row[key].length));
  const widths = { tool: width("tool"), what: width("what") };
  const rule: ToolRow = { tool: "-".repeat(widths.tool), what: "-".repeat(widths.what) };
  return [header, rule, ...rows]
    .map(({ tool, what }) => `| ${tool.padEnd(widths.tool)} | ${what.padEnd(widths.what)} |`)
    .join("\n");
}

const FACTS = {
  "api.readCacheMinutes": String(READ_CACHE_MINUTES),
  "api.readQuota": String(READ_QUOTA.quota),
  "api.readWindowSeconds": String(READ_QUOTA.windowSeconds),
  "api.readPolicy": READ_POLICY,
  "api.readRateLimit": `"${READ_QUOTA.name}";r=${READ_QUOTA.quota - 1};t=${READ_QUOTA.windowSeconds}`,
  "api.contactPerClient": String(CONTACT_DAILY_PER_CLIENT),
  "api.contactSiteWide": String(CONTACT_DAILY_GLOBAL),
  "api.contactPolicy": CONTACT_POLICY,
  "api.deprecationDays": String(DEPRECATION_NOTICE_DAYS),
  "mcp.protocolVersion": LATEST_PROTOCOL_VERSION,
  "mcp.legacyVersions": LEGACY_PROTOCOL_VERSIONS.map(code).join(", "),
  "mcp.toolCount": String(MCP_TOOLS.length),
  "mcp.toolNames": MCP_TOOLS.map(tool => tool.name).join(", "),
  "mcp.toolTable": toolTable(),
  "mcp.validationError": MCP_VALIDATION_ERROR,
  "mcp.resources": MCP_RESOURCES.map(key => code(DOCUMENTS[key].path)).join(", "),
  "webmcp.toolNames": andList.format(WEBMCP_TOOL_NAMES.map(code)),
  "surface.entryPoints": entryPoints()
};

const PLACEHOLDER = /\{\{[\w.]+\}\}/g;

export function render({
  template,
  facts
}: {
  template: string;
  facts: Partial<Record<string, string>>;
}): string {
  return template.replaceAll(PLACEHOLDER, placeholder => {
    const value = facts[placeholder.slice(2, -2)];
    if (value === undefined) throw new Error(`${placeholder} has no fact to render`);
    return value;
  });
}

export const agentGuide = () => render({ template: GUIDE, facts: FACTS });

export const llmsPreamble = () => render({ template: LLMS_PREAMBLE, facts: FACTS });
