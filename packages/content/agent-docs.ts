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
