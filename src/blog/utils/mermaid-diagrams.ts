// Pure, Node-free half of the Mermaid pipeline (runs in the Workers test pool
// and the build). `bun run diagrams` commits a light and dark SVG per fence,
// named by hash; remark-mermaid.ts and the RSS route swap fences for them.
import { fromMarkdown } from "mdast-util-from-markdown";
import type { Code, Parent, Root } from "mdast";

export const DIAGRAMS_DIR = "diagrams";
export type DiagramTheme = "light" | "dark";
export const DIAGRAM_THEMES: readonly DiagramTheme[] = ["light", "dark"];

// Folded into every hash. Bump when render output changes in a way the mermaid
// version stamp doesn't capture (theme, font, embedded style).
export const RENDERER_VERSION = "2";

export interface MermaidFence {
  // Diagram source exactly as the markdown parser hands it to the build:
  // container indentation (a fence inside a list item) already stripped.
  source: string;
  // Offsets into the markdown of the whole fence, opening line through closing
  // line (exclusive end; no trailing newline).
  start: number;
  end: number;
}

// Walks the tree in document order so fence numbering matches the page.
function collectCode(node: Parent, out: Code[]): void {
  for (const child of node.children) {
    if (child.type === "code") {
      if (child.lang === "mermaid") out.push(child);
    } else if ("children" in child) {
      collectCode(child, out);
    }
  }
}

// Same CommonMark parser as Astro's remark pipeline, so fence detection and
// `value` (hence hashes and file names) match the build exactly.
export function findMermaidFences(markdown: string): MermaidFence[] {
  const tree: Root = fromMarkdown(markdown);
  const fences: Code[] = [];
  collectCode(tree, fences);
  return fences.map(node => {
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
// Web Crypto rather than node:crypto so it runs in the Workers test pool.
export async function diagramHash(source: string): Promise<string> {
  const normalised = source.replace(/\r\n?/g, "\n").trim();
  const bytes = new TextEncoder().encode(`${RENDERER_VERSION}\n${normalised}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 6)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
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
