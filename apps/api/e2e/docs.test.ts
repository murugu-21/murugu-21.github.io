import { parseHTML } from "linkedom";
import { describe, expect, it } from "vite-plus/test";

import { SITE_ORIGIN } from "@murugappan/content/site.ts";
import { MCP_TOOLS } from "@murugappan/contracts/mcp.ts";
import { WEBMCP_TOOL_NAMES } from "@murugappan/contracts/webmcp.ts";

import { get, origin, text } from "./server.ts";

const isTemplated = (target: string) => target.includes("{");

const LINK_OR_GET_EXAMPLE = /\]\((?<link>[^)\s]+)\)|`GET (?<call>[^`\s]+)`/g;
const MCP_ENDPOINT = "/mcp";
const MAX_HOPS = 5;

function siteTargets(markdown: string): string[] {
  return [...markdown.matchAll(LINK_OR_GET_EXAMPLE)].flatMap(({ groups }) => {
    const target = groups?.link ?? groups?.call ?? "";
    const url = new URL(target, SITE_ORIGIN);
    if (isTemplated(target) || url.origin !== SITE_ORIGIN || url.hash !== "") return [];
    return [`${url.pathname}${url.search}`];
  });
}

async function followSameOriginRedirects(
  path: string
): Promise<{ status: number; chain: string[] }> {
  const chain = [path];
  let at = path;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const response = await get(at);
    const location = response.headers.get("Location");
    if (location === null) return { status: response.status, chain };
    const next = new URL(location, origin);
    if (next.origin !== origin) {
      throw new Error(`${chain.join(" -> ")} redirects off this origin to ${location}`);
    }
    at = `${next.pathname}${next.search}`;
    chain.push(at);
  }
  throw new Error(`${chain.join(" -> ")} redirects more than ${MAX_HOPS} times`);
}

const documents = await Promise.all(["/AGENTS.md", "/llms.txt"].map(text));
const targets = [...new Set(documents.flatMap(siteTargets))];
const portalCode = [...parseHTML(await text("/developers/")).document.querySelectorAll("code")].map(
  el => el.textContent
);

describe("the agent documents", () => {
  it("name the cheapest call", () => {
    expect(targets).toContain("/api/v1/profile");
  });

  it.each(targets.filter(path => path !== MCP_ENDPOINT))(
    "link to %s, which answers",
    async path => {
      const { status, chain } = await followSameOriginRedirects(path);
      expect(status, `${chain.join(" -> ")} answered ${status}`).toBeLessThan(400);
    }
  );

  it("link to the MCP endpoint, which takes POST only", async () => {
    expect(targets).toContain(MCP_ENDPOINT);
    const { status, chain } = await followSameOriginRedirects(MCP_ENDPOINT);
    expect(status, chain.join(" -> ")).toBe(405);
  });
});

describe("the developer portal", () => {
  it.each([...MCP_TOOLS.map(tool => tool.name), ...WEBMCP_TOOL_NAMES])(
    "names the %s tool",
    name => {
      expect(portalCode).toContain(name);
    }
  );
});
