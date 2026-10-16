import { describe, expect, it } from "vite-plus/test";

import { LATEST_PROTOCOL_VERSION, MCP_TOOLS } from "@murugappan/contracts/mcp.ts";
import { WEBMCP_TOOL_NAMES } from "@murugappan/contracts/webmcp.ts";
import GUIDE from "./agent-guide.md?raw";
import { agentGuide, llmsPreamble, render } from "./agent-docs.ts";
import MCP_VALIDATION_ERROR from "./generated/mcp-validation-error.txt?raw";
import LLMS_PREAMBLE from "./llms-preamble.txt?raw";

describe("render", () => {
  it("fills every placeholder from the facts", () => {
    expect(render({ template: "{{a}}, {{b}} and {{a}}", facts: { a: "1", b: "2" } })).toBe(
      "1, 2 and 1"
    );
  });

  it("throws naming a placeholder that has no fact", () => {
    expect(() => render({ template: "x {{nope}} y", facts: { a: "1" } })).toThrow("{{nope}}");
  });
});

describe("agentGuide", () => {
  it("renders the tool table, count and legacy revisions from the registry", () => {
    const guide = agentGuide();

    expect(guide).toContain(
      "| `get_blog_post`     | One post's full markdown (`slug`)                                 |"
    );
    expect(guide).toContain("8 tools, each with a typed `outputSchema`");
    expect(guide).toContain("(`2025-11-25`, `2025-06-18`, `2025-03-26`)");
  });

  it("names the in-browser tools from the WebMCP registry", () => {
    expect(agentGuide()).toContain(
      "Every page registers `get_profile`, `list_blog_posts`, `get_blog_post` and `navigate_to` on"
    );
  });

  it("lists the entry points and the MCP resources from the surface registry", () => {
    const guide = agentGuide();

    expect(guide).toContain(
      "- [Every indexable URL on this site](https://murugappan.dev/sitemap.xml)\n- [Site summary for LLMs](https://murugappan.dev/llms.txt)\n"
    );
    expect(guide).toContain(
      "calling tools: `/llms.txt`, `/AGENTS.md`, `/openapi.json`, `/blog/llms-full.txt`, and every post's markdown"
    );
  });
});

describe("llmsPreamble", () => {
  it("lists the entry points under the discovery heading", () => {
    expect(llmsPreamble()).toContain(
      "## Discovery documents\n- [Every indexable URL on this site](https://murugappan.dev/sitemap.xml)\n"
    );
  });
});

describe("agent documents", () => {
  const toolNames = MCP_TOOLS.map(tool => tool.name);

  it.each([
    {
      document: "the agent guide",
      template: GUIDE,
      rendered: agentGuide(),
      facts: [LATEST_PROTOCOL_VERSION, MCP_VALIDATION_ERROR, ...toolNames, ...WEBMCP_TOOL_NAMES]
    },
    {
      document: "the llms preamble",
      template: LLMS_PREAMBLE,
      rendered: llmsPreamble(),
      facts: toolNames
    }
  ])(
    "$document states the registry's facts only through placeholders",
    ({ template, rendered, facts }) => {
      for (const fact of facts) {
        expect(template, fact).not.toContain(fact);
        expect(rendered, fact).toContain(fact);
      }
    }
  );
});
