import { describe, expect, it } from "vitest";

import {
  DIAGRAMS_DIR,
  diagramAlt,
  diagramFile,
  diagramHash,
  diagramRaster,
  findMermaidFences,
  replaceMermaidFences
} from "./mermaid-diagrams";

const post = `# Title

Intro paragraph.

\`\`\`mermaid
flowchart LR
    A --> B
\`\`\`

\`\`\`js
const notADiagram = "\`\`\`mermaid";
\`\`\`

Text between.

~~~mermaid
sequenceDiagram
    A->>B: hi
~~~

\`\`\`\`md
A markdown sample that itself contains a fence:

\`\`\`mermaid
flowchart TD
    X --> Y
\`\`\`
\`\`\`\`

End.
`;

describe("findMermaidFences", () => {
  it("finds every top-level mermaid fence, in order, with the body trimmed", () => {
    const fences = findMermaidFences(post);
    expect(fences.map(f => f.source)).toEqual([
      "flowchart LR\n    A --> B",
      "sequenceDiagram\n    A->>B: hi"
    ]);
  });

  it("ignores fences of other languages and fences nested inside a longer fence", () => {
    // The js fence and the ````md sample above must not produce entries; a
    // naive regex would match the "```mermaid" inside both.
    expect(findMermaidFences(post)).toHaveLength(2);
  });

  it("reports the exact span of each fence, opening line through closing line", () => {
    const [first] = findMermaidFences(post);
    expect(post.slice(first.start, first.end)).toBe("```mermaid\nflowchart LR\n    A --> B\n```");
  });

  it("returns nothing for a post without diagrams", () => {
    expect(findMermaidFences("# Hi\n\n```js\nlet x = 1;\n```\n")).toEqual([]);
  });

  it("treats an unterminated fence as running to the end of the document", () => {
    expect(findMermaidFences("```mermaid\nflowchart LR\n  A --> B\n").map(f => f.source)).toEqual([
      "flowchart LR\n  A --> B"
    ]);
  });

  it("accepts an info string after the language", () => {
    expect(findMermaidFences("```mermaid title=Flow\nflowchart LR\n  A --> B\n```\n")).toHaveLength(
      1
    );
  });

  it("finds fences nested in a list item or blockquote, with the container indent stripped", () => {
    // Same parser as the build, so the source (and hash) match what
    // remark-mermaid sees for the same fence.
    const md =
      "- step\n\n  ```mermaid\n  flowchart LR\n    A --> B\n  ```\n\n> ```mermaid\n> flowchart TD\n>   X --> Y\n> ```\n";
    expect(findMermaidFences(md).map(f => f.source)).toEqual([
      "flowchart LR\n  A --> B",
      "flowchart TD\n  X --> Y"
    ]);
  });
});

describe("diagramHash", () => {
  it("is stable for the same source and differs when the source changes", async () => {
    const a = await diagramHash("flowchart LR\n  A --> B");
    const b = await diagramHash("flowchart LR\n  A --> B");
    const c = await diagramHash("flowchart LR\n  A --> C");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });

  it("ignores surrounding whitespace, so reformatting the fence never re-renders", async () => {
    expect(await diagramHash("\n  flowchart LR\n  A --> B  \n\n")).toBe(
      await diagramHash("flowchart LR\n  A --> B")
    );
  });

  it("hashes CRLF and LF sources the same, so a checkout's line endings never re-render", async () => {
    expect(await diagramHash("flowchart LR\r\n  A --> B\r\n")).toBe(
      await diagramHash("flowchart LR\n  A --> B\n")
    );
  });
});

describe("diagramFile / diagramAlt", () => {
  it("names one file per theme under the post's diagrams directory", () => {
    expect(diagramFile("abc123def456", "light")).toBe(`${DIAGRAMS_DIR}/abc123def456.light.svg`);
    expect(diagramFile("abc123def456", "dark")).toBe(`${DIAGRAMS_DIR}/abc123def456.dark.svg`);
    expect(diagramRaster("abc123def456")).toBe(`${DIAGRAMS_DIR}/abc123def456.png`);
  });

  it("numbers diagrams from one", () => {
    expect(diagramAlt(0)).toBe("Diagram 1");
    expect(diagramAlt(2)).toBe("Diagram 3");
  });
});

describe("replaceMermaidFences", () => {
  it("swaps each fence for a markdown image of the PNG rendering and leaves the rest untouched", async () => {
    const out = await replaceMermaidFences(post);
    const fences = findMermaidFences(post);
    const first = await diagramHash(fences[0].source);
    const second = await diagramHash(fences[1].source);
    expect(out).toContain(`![Diagram 1](${DIAGRAMS_DIR}/${first}.png)`);
    expect(out).toContain(`![Diagram 2](${DIAGRAMS_DIR}/${second}.png)`);
    expect(out).not.toContain("```mermaid\nflowchart LR");
    expect(out).not.toContain("~~~mermaid");
    // Untouched: the js fence, the nested sample and the prose.
    expect(out).toContain('const notADiagram = "```mermaid";');
    expect(out).toContain("```mermaid\nflowchart TD\n    X --> Y\n```\n````");
    expect(out).toContain("Text between.");
    expect(out.endsWith("End.\n")).toBe(true);
  });

  it("returns the input unchanged when there is nothing to replace", async () => {
    const md = "# Hi\n\nplain\n";
    expect(await replaceMermaidFences(md)).toBe(md);
  });
});
