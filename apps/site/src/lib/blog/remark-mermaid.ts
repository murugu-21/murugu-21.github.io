import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Image, Paragraph, Root } from "mdast";
import type { VFile } from "vfile";

import {
  DIAGRAM_THEMES,
  collectMermaidNodes,
  diagramAlt,
  diagramFile,
  diagramHash,
  type DiagramTheme
} from "./mermaid-diagrams";

function svgSize(svg: string): { width: number; height: number } | undefined {
  const viewBox = svg.match(/\bviewBox="([^"]+)"/);
  if (!viewBox) return undefined;
  const [, , width, height] = viewBox[1].trim().split(/\s+/).map(Number);
  return width > 0 && height > 0
    ? { width: Math.round(width), height: Math.round(height) }
    : undefined;
}

const themeClass = {
  light: "mx-auto rounded-lg bg-white p-3 dark:hidden",
  dark: "mx-auto hidden rounded-lg bg-dark-bg p-3 dark:block"
} satisfies Record<DiagramTheme, string>;

const RENDER_SCRIPT = fileURLToPath(new URL("../../../scripts/render-mermaid.ts", import.meta.url));

function renderMissing(): void {
  const result = spawnSync("bun", [RENDER_SCRIPT], { stdio: "inherit" });
  if (result.status !== 0)
    throw new Error("remark-mermaid: apps/site/scripts/render-mermaid.ts failed");
}

export default function remarkMermaid() {
  return async function transform(tree: Root, file: VFile): Promise<void> {
    const fences = collectMermaidNodes(tree);
    if (fences.length === 0) return;
    if (!file.path) {
      throw new Error("remark-mermaid: a mermaid fence was found in markdown with no file path");
    }
    const postDir = dirname(file.path);

    for (const [i, { node, parent, index }] of fences.entries()) {
      const hash = await diagramHash(node.value);
      const pathOf = (theme: DiagramTheme) => join(postDir, diagramFile(hash, theme));
      if (!DIAGRAM_THEMES.every(theme => existsSync(pathOf(theme)))) renderMissing();
      for (const theme of DIAGRAM_THEMES) {
        if (!existsSync(pathOf(theme))) {
          throw new Error(
            `remark-mermaid: ${relative(process.cwd(), pathOf(theme))} was not rendered for ${diagramAlt(i).toLowerCase()} of ${relative(process.cwd(), file.path)}`
          );
        }
      }
      const size = svgSize(readFileSync(pathOf("light"), "utf8"));

      const images: Image[] = DIAGRAM_THEMES.map(theme => ({
        type: "image",
        url: diagramFile(hash, theme),
        alt: diagramAlt(i),
        data: {
          hProperties: {
            // Astro's image pipeline copies these attributes verbatim.
            class: themeClass[theme],
            loading: "lazy",
            decoding: "async",
            ...size
          }
        }
      }));
      const figure: Paragraph = {
        type: "paragraph",
        data: { hName: "figure", hProperties: { dataMermaid: "" } },
        children: images
      };
      parent.children.splice(index, 1, figure);
    }
  };
}
