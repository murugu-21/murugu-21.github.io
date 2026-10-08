import { mkdirSync, writeFileSync } from "node:fs";
import { fromMarkdown } from "mdast-util-from-markdown";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import { diagramFile, diagramHash } from "./mermaid-diagrams";
import remarkMermaid from "./remark-mermaid";

const FENCE = "flowchart LR\n  A --> B";

async function renderedPost({ viewBox }: { viewBox: string }) {
  const postDir = "/tmp/remark-mermaid-post";
  const hash = await diagramHash(FENCE);
  mkdirSync(`${postDir}/diagrams`, { recursive: true });
  for (const theme of ["light", "dark"] as const) {
    writeFileSync(
      `${postDir}/${diagramFile(hash, theme)}`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"></svg>`
    );
  }
  return { file: new VFile({ path: `${postDir}/index.md` }), hash };
}

describe("remarkMermaid", () => {
  it("swaps each fence for a figure holding its light and dark rendering, sized from the viewBox", async () => {
    const { file, hash } = await renderedPost({ viewBox: "0 0 400.4 199.6" });
    const tree = fromMarkdown(`Intro\n\n\`\`\`mermaid\n${FENCE}\n\`\`\`\n\nOutro\n`);

    await remarkMermaid()(tree, file);

    expect(tree.children).toHaveLength(3);
    expect(tree.children[1]).toMatchObject({
      type: "paragraph",
      data: { hName: "figure", hProperties: { dataMermaid: "" } },
      children: ["light", "dark"].map(theme => ({
        type: "image",
        url: `diagrams/${hash}.${theme}.svg`,
        alt: "Diagram 1",
        data: {
          hProperties: {
            loading: "lazy",
            decoding: "async",
            width: 400,
            height: 200
          }
        }
      }))
    });
  });

  // Lazy loading plus display:none stops the browser fetching the other theme's SVG.
  it("shows the light image by day and the dark one at night, hiding the other", async () => {
    const { file } = await renderedPost({ viewBox: "0 0 400 200" });
    const tree = fromMarkdown(`\`\`\`mermaid\n${FENCE}\n\`\`\`\n`);

    await remarkMermaid()(tree, file);

    const images = [...JSON.stringify(tree.children[0]).matchAll(/"class":"([^"]*)"/g)].map(m =>
      m[1].split(" ")
    );
    // Whether an image displays under Tailwind's `hidden`, `dark:hidden` and `dark:block`.
    const shownByDay = (cls: string[]) => !cls.includes("hidden");
    const shownAtNight = (cls: string[]) =>
      cls.includes("dark:block") || (shownByDay(cls) && !cls.includes("dark:hidden"));
    expect(images.map(shownByDay)).toEqual([true, false]);
    expect(images.map(shownAtNight)).toEqual([false, true]);
  });

  it("omits the size when the SVG has no usable viewBox", async () => {
    const { file } = await renderedPost({ viewBox: "0 0 0 0" });
    const tree = fromMarkdown(`\`\`\`mermaid\n${FENCE}\n\`\`\`\n`);

    await remarkMermaid()(tree, file);

    expect(JSON.stringify(tree.children[0])).not.toContain("width");
    expect(JSON.stringify(tree.children[0])).toContain('"loading":"lazy"');
  });

  it("leaves a post without diagrams alone, and refuses a diagram in a file with no path", async () => {
    const plain = fromMarkdown("Just text.\n");
    await remarkMermaid()(plain, new VFile());
    expect(plain.children).toHaveLength(1);

    const diagram = fromMarkdown(`\`\`\`mermaid\n${FENCE}\n\`\`\`\n`);
    await expect(remarkMermaid()(diagram, new VFile())).rejects.toThrow(
      "remark-mermaid: a mermaid fence was found in markdown with no file path"
    );
  });
});
