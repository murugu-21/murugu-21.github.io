import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Code, Image, Paragraph, Parent, Root } from "mdast";
import type { VFile } from "vfile";

import {
  DIAGRAM_THEMES,
  diagramAlt,
  diagramFile,
  diagramHash,
  type DiagramTheme
} from "./mermaid-diagrams";

// Build-time half of the Mermaid pipeline (see mermaid-diagrams.ts): each
// ```mermaid fence becomes a <figure class="mermaid-diagram"> with a light and
// a dark <img> (post.css shows one per theme). Post-relative mdast images let
// Astro's image pipeline and the RSS absolutizer treat them like any post
// image. A missing rendering fails the build rather than shipping broken.

interface Fence {
  node: Code;
  parent: Parent;
  index: number;
}

function collectFences(node: Parent, out: Fence[]): void {
  node.children.forEach((child, index) => {
    if (child.type === "code" && child.lang === "mermaid") {
      out.push({ node: child, parent: node, index });
    } else if ("children" in child) {
      collectFences(child, out);
    }
  });
}

// Intrinsic size from the viewBox: reserves layout space and gives medium-zoom
// its natural dimensions.
function svgSize(svg: string): { width: number; height: number } | undefined {
  const viewBox = svg.match(/\bviewBox="([^"]+)"/);
  if (!viewBox) return undefined;
  const [, , width, height] = viewBox[1].trim().split(/\s+/).map(Number);
  return width > 0 && height > 0
    ? { width: Math.round(width), height: Math.round(height) }
    : undefined;
}

export default function remarkMermaid() {
  return async function transform(tree: Root, file: VFile): Promise<void> {
    const fences: Fence[] = [];
    collectFences(tree, fences);
    if (fences.length === 0) return;
    if (!file.path) {
      throw new Error("remark-mermaid: a mermaid fence was found in markdown with no file path");
    }
    const postDir = dirname(file.path);

    // Replace from the end so earlier sibling indexes stay valid.
    for (const [i, { node, parent, index }] of [...fences.entries()].reverse()) {
      const hash = await diagramHash(node.value);
      const paths = Object.fromEntries(
        DIAGRAM_THEMES.map(theme => [theme, join(postDir, diagramFile(hash, theme))])
      ) as Record<DiagramTheme, string>;
      for (const theme of DIAGRAM_THEMES) {
        if (!existsSync(paths[theme])) {
          throw new Error(
            `remark-mermaid: ${relative(process.cwd(), paths[theme])} is missing for ${diagramAlt(i).toLowerCase()} of ${relative(process.cwd(), file.path)} ` +
              "(the fence changed or was never rendered). Run `bun run diagrams` and commit the result."
          );
        }
      }
      const size = svgSize(readFileSync(paths.light, "utf8"));

      const images: Image[] = DIAGRAM_THEMES.map(theme => ({
        type: "image",
        url: diagramFile(hash, theme),
        alt: diagramAlt(i),
        data: {
          hProperties: {
            className: [`mermaid-${theme}`],
            // Lazy so the theme that is display:none is never fetched.
            loading: "lazy",
            decoding: "async",
            ...size
          }
        }
      }));
      const figure: Paragraph = {
        type: "paragraph",
        data: { hName: "figure", hProperties: { className: ["mermaid-diagram"] } },
        children: images
      };
      parent.children.splice(index, 1, figure);
    }
  };
}
