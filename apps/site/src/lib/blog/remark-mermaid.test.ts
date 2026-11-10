import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fromMarkdown } from "mdast-util-from-markdown";
import { VFile } from "vfile";
import { describe, expect, it, onTestFinished } from "vite-plus/test";

import { diagramFile, diagramHash } from "./mermaid-diagrams";
import remarkMermaid from "./remark-mermaid";

const FENCE = "flowchart LR\n  accDescr: A hands off to B\n  A --> B";

async function renderedPost({ viewBox }: { viewBox: string }) {
  const postDir = mkdtempSync(join(tmpdir(), "remark-mermaid-post-"));
  onTestFinished(() => rmSync(postDir, { recursive: true, force: true }));
  const hash = await diagramHash(FENCE);
  mkdirSync(join(postDir, "diagrams"), { recursive: true });
  for (const theme of ["light", "dark"] as const) {
    writeFileSync(
      join(postDir, diagramFile(hash, theme)),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"></svg>`
    );
  }
  return { file: new VFile({ path: join(postDir, "index.md") }), hash };
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
        alt: "A hands off to B",
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

  it("shows the light image by day and the dark one at night, hiding the other", async () => {
    const { file } = await renderedPost({ viewBox: "0 0 400 200" });
    const tree = fromMarkdown(`\`\`\`mermaid\n${FENCE}\n\`\`\`\n`);

    await remarkMermaid()(tree, file);

    const images = [...JSON.stringify(tree.children[0]).matchAll(/"class":"([^"]*)"/g)].map(m =>
      m[1].split(" ")
    );
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

  it("fails the build for a diagram with no accDescr line", async () => {
    const tree = fromMarkdown("```mermaid\nflowchart LR\n  A --> B\n```\n");

    await expect(remarkMermaid()(tree, new VFile({ path: "blog/post/index.md" }))).rejects.toThrow(
      "blog/post/index.md: diagram 1 has no alt text."
    );
  });
});
