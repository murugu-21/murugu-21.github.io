import { describe, expect, it } from "vitest";

import { diagramHash, findMermaidFences, replaceMermaidFences } from "./mermaid-diagrams";

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

const postFences = findMermaidFences(post);

describe("findMermaidFences", () => {
  it("finds only top-level mermaid fences, in order, with the body trimmed", () => {
    // A naive regex would also match the "```mermaid" inside the js fence and
    // the ````md sample.
    expect(postFences.map(f => f.source)).toEqual([
      "flowchart LR\n    A --> B",
      "sequenceDiagram\n    A->>B: hi"
    ]);
  });

  it("reports the exact span of each fence, opening line through closing line", () => {
    const [first] = postFences;
    expect(post.slice(first.start, first.end)).toBe("```mermaid\nflowchart LR\n    A --> B\n```");
  });

  it("treats an unterminated fence as running to the end of the document", () => {
    expect(findMermaidFences("```mermaid\nflowchart LR\n  A --> B\n").map(f => f.source)).toEqual([
      "flowchart LR\n  A --> B"
    ]);
  });

  it("accepts an info string after the language", () => {
    expect(
      findMermaidFences("```mermaid title=Flow\nflowchart LR\n  A --> B\n```\n").map(f => f.source)
    ).toEqual(["flowchart LR\n  A --> B"]);
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
  // The hash names the rendered PNG, so it must change with the diagram and
  // with nothing else, or reformatting a post would re-render its diagrams.
  it.each([
    ["the source", "flowchart LR\n  A --> B"],
    ["surrounding whitespace", "\n  flowchart LR\n  A --> B  \n\n"],
    ["CRLF line endings", "flowchart LR\r\n  A --> B\r\n"]
  ])("hashes %s to the same 12-hex name", async (_, source) => {
    expect(await diagramHash(source)).toBe("2fb62bdab16d");
  });

  it("gives a changed diagram a new name", async () => {
    expect(await diagramHash("flowchart LR\n  A --> C")).toBe("a8e4cdbc5032");
  });
});

describe("replaceMermaidFences", () => {
  it("swaps each fence for a markdown image of the PNG rendering and leaves the rest untouched", async () => {
    const out = await replaceMermaidFences(post);
    expect(out).toContain("![Diagram 1](diagrams/f367cfc9c9f4.png)");
    expect(out).toContain("![Diagram 2](diagrams/516350518f75.png)");
    expect(out).not.toContain("```mermaid\nflowchart LR");
    expect(out).not.toContain("~~~mermaid");
    // the js fence, the nested sample and the prose survive
    expect(out).toContain('const notADiagram = "```mermaid";');
    expect(out).toContain("```mermaid\nflowchart TD\n    X --> Y\n```\n````");
    expect(out).toContain("Text between.");
    expect(out.endsWith("End.\n")).toBe(true);
  });

  it("returns a post without diagrams unchanged", async () => {
    const md = "# Hi\n\n```js\nlet x = 1;\n```\n";
    expect(await replaceMermaidFences(md)).toBe(md);
  });
});
