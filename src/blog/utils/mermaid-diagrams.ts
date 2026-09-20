// ```mermaid fences are rendered at build time, never in the reader's browser.
// `bun run diagrams` (scripts/render-mermaid.ts) renders every fence in
// content/blog/**/index.md to two SVGs — one per theme — committed next to the
// post under `diagrams/`, named by a hash of the fence body. The remark plugin
// (remark-mermaid.ts) then swaps each fence for those images and fails the
// build when a rendering is missing, so a fence edit without a re-render can
// never ship; the RSS route does the same swap on the raw markdown so feed
// readers and mirrors (dev.to, Hashnode) get a plain <img> instead of diagram
// source. This module is the pure, shared part: fence discovery, naming and
// the markdown-level replacement. It has no Node dependencies so it can run
// in the Workers test pool and in the Astro build alike.
import { fromMarkdown } from "mdast-util-from-markdown";
import type { Code, Parent, Root } from "mdast";

export const DIAGRAMS_DIR = "diagrams";
export type DiagramTheme = "light" | "dark";
export const DIAGRAM_THEMES: readonly DiagramTheme[] = ["light", "dark"];

// Folded into every hash. Bump when the renderer changes output for the same
// source in a way the mermaid version stamp (see render-mermaid.ts) does not
// capture — theme, font, embedded style — so the build demands fresh files.
export const RENDERER_VERSION = "1";

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

// The same CommonMark parser Astro's remark pipeline uses (remark-parse is a
// thin wrapper over it), so a fence is a diagram here exactly when the build
// treats it as one: a "```mermaid" inside a longer ````md fence or a js
// string is not, and a fence nested in a list or blockquote is, with the same
// `value` on both sides — which is what keeps the hashes, and therefore the
// file names the build looks for, identical.
export function findMermaidFences(markdown: string): MermaidFence[] {
  const tree: Root = fromMarkdown(markdown);
  const fences: Code[] = [];
  collectCode(tree, fences);
  return fences.map(node => {
    if (!node.position?.start.offset && node.position?.start.offset !== 0) {
      throw new Error("findMermaidFences: parser returned a code node without a position");
    }
    return {
      source: node.value,
      start: node.position.start.offset,
      end: node.position.end.offset ?? markdown.length
    };
  });
}

// Twelve hex chars of SHA-256 over the trimmed, LF-normalised source plus the
// renderer version: enough to never collide across a blog, short enough to
// read in a diff. Web Crypto rather than node:crypto so it runs in the
// Workers test pool.
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

export const diagramAlt = (index: number) => `Diagram ${index + 1}`;

// The raw-markdown counterpart of the remark plugin, for pipelines that never
// see an mdast (the RSS route runs markdown-it): each fence becomes a plain
// image of the light rendering, relative to the post directory like any other
// post image.
export async function replaceMermaidFences(markdown: string): Promise<string> {
  const fences = findMermaidFences(markdown);
  if (fences.length === 0) return markdown;
  let out = "";
  let cursor = 0;
  for (const [i, fence] of fences.entries()) {
    const hash = await diagramHash(fence.source);
    out += markdown.slice(cursor, fence.start);
    out += `![${diagramAlt(i)}](${diagramFile(hash, "light")})`;
    cursor = fence.end;
  }
  return out + markdown.slice(cursor);
}
