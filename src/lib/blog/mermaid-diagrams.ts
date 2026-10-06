// Pure, Node-free half of the Mermaid pipeline (runs in the Workers test pool
// and the build). scripts/render-mermaid.ts writes a light and dark SVG per
// fence at build time, named by hash; remark-mermaid.ts and the RSS route swap
// fences for them.
import { fromMarkdown } from "mdast-util-from-markdown";
import type { Code, Parent } from "mdast";

import { sha256Hex } from "#src/lib/hash.ts";

export const DIAGRAMS_DIR = "diagrams";
export type DiagramTheme = "light" | "dark";
export const DIAGRAM_THEMES: readonly DiagramTheme[] = ["light", "dark"];

// Folded into every hash. Bump when render output changes in a way the mermaid
// version stamp doesn't capture (theme, font, embedded style).
const RENDERER_VERSION = "4";

interface MermaidFence {
  // Diagram source exactly as the markdown parser hands it to the build:
  // container indentation (a fence inside a list item) already stripped.
  source: string;
  // Offsets into the markdown of the whole fence, opening line through closing
  // line (exclusive end; no trailing newline).
  start: number;
  end: number;
}

interface MermaidNode {
  node: Code;
  parent: Parent;
  index: number;
}

// Walks the tree in document order so fence numbering matches the page.
export function collectMermaidNodes(parent: Parent): MermaidNode[] {
  return parent.children.flatMap((child, index) => {
    if (child.type === "code" && child.lang === "mermaid") return [{ node: child, parent, index }];
    return "children" in child ? collectMermaidNodes(child) : [];
  });
}

// Same CommonMark parser as Astro's remark pipeline, so fence detection and
// `value` (hence hashes and file names) match the build exactly.
export function findMermaidFences(markdown: string): MermaidFence[] {
  return collectMermaidNodes(fromMarkdown(markdown)).map(({ node }) => {
    if (node.position?.start.offset === undefined) {
      throw new Error("findMermaidFences: parser returned a code node without a position");
    }
    return {
      source: node.value,
      start: node.position.start.offset,
      end: node.position.end.offset ?? markdown.length
    };
  });
}

// 12 hex chars of SHA-256 over the normalised source and renderer version.
export async function diagramHash(source: string): Promise<string> {
  const normalised = source.replace(/\r\n?/g, "\n").trim();
  return (await sha256Hex(`${RENDERER_VERSION}\n${normalised}`)).slice(0, 12);
}

export const diagramFile = (hash: string, theme: DiagramTheme) =>
  `${DIAGRAMS_DIR}/${hash}.${theme}.svg`;

// Light rendering as PNG, feed only: dev.to/Hashnode rasterizers can't draw
// mermaid's foreignObject labels or embedded font, so SVGs come out blank.
export const diagramRaster = (hash: string) => `${DIAGRAMS_DIR}/${hash}.png`;

export const diagramAlt = (index: number) => `Diagram ${index + 1}`;

// Raw-markdown counterpart of the remark plugin for the RSS route
// (markdown-it): each fence becomes a post-relative image of the light PNG.
export async function replaceMermaidFences(markdown: string): Promise<string> {
  const fences = findMermaidFences(markdown);
  if (fences.length === 0) return markdown;
  let out = "";
  let cursor = 0;
  for (const [i, fence] of fences.entries()) {
    const hash = await diagramHash(fence.source);
    out += markdown.slice(cursor, fence.start);
    out += `![${diagramAlt(i)}](${diagramRaster(hash)})`;
    cursor = fence.end;
  }
  return out + markdown.slice(cursor);
}
