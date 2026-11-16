import { readFile } from "node:fs/promises";
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
import { exists } from "@murugappan/utils/node/fs.ts";
import { spawnInherit } from "@murugappan/utils/node/process.ts";

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

async function runRenderScript(): Promise<void> {
  if ((await spawnInherit("bun", [RENDER_SCRIPT])) !== 0) {
    throw new Error("remark-mermaid: apps/site/scripts/render-mermaid.ts failed");
  }
}

let inFlightRender: Promise<void> | undefined;
function joinInFlightRender(render: () => Promise<void>): Promise<void> {
  inFlightRender ??= render().finally(() => {
    inFlightRender = undefined;
  });
  return inFlightRender;
}
const waitForInFlightRender = () => inFlightRender;

const missingThemes = (pathOf: (theme: DiagramTheme) => string) =>
  Promise.all(
    DIAGRAM_THEMES.map(async theme => ((await exists(pathOf(theme))) ? [] : [theme]))
  ).then(missing => missing.flat());

export default function remarkMermaid({
  render = runRenderScript
}: { render?: () => Promise<void> } = {}) {
  return async function transform(tree: Root, file: VFile): Promise<void> {
    const fences = collectMermaidNodes(tree);
    if (fences.length === 0) return;
    if (!file.path) {
      throw new Error("remark-mermaid: a mermaid fence was found in markdown with no file path");
    }
    const postDir = dirname(file.path);
    const postLabel = relative(process.cwd(), file.path);

    for (const [i, { node, parent, index }] of fences.entries()) {
      const alt = diagramAlt({ source: node.value, postLabel, index: i });
      const hash = await diagramHash(node.value);
      const pathOf = (theme: DiagramTheme) => join(postDir, diagramFile(hash, theme));
      await waitForInFlightRender();
      if ((await missingThemes(pathOf)).length > 0) await joinInFlightRender(render);
      const [unrendered] = await missingThemes(pathOf);
      if (unrendered) {
        throw new Error(
          `remark-mermaid: ${relative(process.cwd(), pathOf(unrendered))} was not rendered for diagram ${i + 1} of ${postLabel}`
        );
      }
      const size = svgSize(await readFile(pathOf("light"), "utf8"));

      const images: Image[] = DIAGRAM_THEMES.map(theme => ({
        type: "image",
        url: diagramFile(hash, theme),
        alt,
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
