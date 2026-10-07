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
    expect(tree.children[1]).toEqual({
      type: "paragraph",
      data: { hName: "figure", hProperties: { className: ["mermaid-diagram"] } },
      children: ["light", "dark"].map(theme => ({
        type: "image",
        url: `diagrams/${hash}.${theme}.svg`,
        alt: "Diagram 1",
        data: {
          hProperties: {
            className: [`mermaid-${theme}`],
            loading: "lazy",
            decoding: "async",
            width: 400,
            height: 200
          }
        }
      }))
    });
  });

  it("omits the size when the SVG has no usable viewBox", async () => {
    const { file } = await renderedPost({ viewBox: "0 0 0 0" });
    const tree = fromMarkdown(`\`\`\`mermaid\n${FENCE}\n\`\`\`\n`);

    await remarkMermaid()(tree, file);

    expect(JSON.stringify(tree.children[0])).not.toContain("width");
    expect(JSON.stringify(tree.children[0])).toContain("mermaid-light");
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
