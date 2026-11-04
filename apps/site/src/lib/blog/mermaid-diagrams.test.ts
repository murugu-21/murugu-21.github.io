import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vite-plus/test";

import { diagramHash, findMermaidFences, replaceMermaidFences } from "./mermaid-diagrams";

const post = `# Title

Intro paragraph.

\`\`\`mermaid
flowchart LR
    accDescr: A sends to B
    A --> B
\`\`\`

\`\`\`js
const notADiagram = "\`\`\`mermaid";
\`\`\`

Text between.

~~~mermaid
sequenceDiagram
    accDescr: A says hi to B
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
    expect(postFences.map(f => f.source)).toEqual([
      "flowchart LR\n    accDescr: A sends to B\n    A --> B",
      "sequenceDiagram\n    accDescr: A says hi to B\n    A->>B: hi"
    ]);
  });

  it("reports the exact span of each fence, opening line through closing line", () => {
    const [first] = postFences;
    expect(post.slice(first.start, first.end)).toBe(
      "```mermaid\nflowchart LR\n    accDescr: A sends to B\n    A --> B\n```"
    );
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
    const md =
      "- step\n\n  ```mermaid\n  flowchart LR\n    A --> B\n  ```\n\n> ```mermaid\n> flowchart TD\n>   X --> Y\n> ```\n";
    expect(findMermaidFences(md).map(f => f.source)).toEqual([
      "flowchart LR\n  A --> B",
      "flowchart TD\n  X --> Y"
    ]);
  });
});

describe("diagramHash", () => {
  it.each([
    ["the source", "flowchart LR\n  A --> B"],
    ["surrounding whitespace", "\n  flowchart LR\n  A --> B  \n\n"],
    ["CRLF line endings", "flowchart LR\r\n  A --> B\r\n"]
  ])("hashes %s to the same 12-hex name", async (_, source) => {
    expect(await diagramHash(source)).toBe("2d21528ec29a");
  });

  it("gives a changed diagram a new name", async () => {
    expect(await diagramHash("flowchart LR\n  A --> C")).toBe("a44b5ecc7ab1");
  });
});

describe("replaceMermaidFences", () => {
  it("swaps each fence for a markdown image of the PNG rendering, alt text from its accDescr", async () => {
    const out = await replaceMermaidFences({ markdown: post, postLabel: "post" });
    expect(out).toContain("![A sends to B](diagrams/33d47f295b5f.png)");
    expect(out).toContain("![A says hi to B](diagrams/58d9f6f35f78.png)");
    expect(out).not.toContain("```mermaid\nflowchart LR");
    expect(out).not.toContain("~~~mermaid");
    expect(out).toContain('const notADiagram = "```mermaid";');
    expect(out).toContain("```mermaid\nflowchart TD\n    X --> Y\n```\n````");
    expect(out).toContain("Text between.");
    expect(out.endsWith("End.\n")).toBe(true);
  });

  it("keeps markdown syntax in the alt text literal", async () => {
    const markdown =
      '```mermaid\nflowchart LR\n  accDescr: Retries [5s, 30s] *then* `fails` \\ <b>stop</b> & "dead"\n  A --> B\n```\n';
    const html = new MarkdownIt({ html: true }).render(
      await replaceMermaidFences({ markdown, postLabel: "post" })
    );
    expect(html).toContain(
      'alt="Retries [5s, 30s] *then* `fails` \\ &lt;b&gt;stop&lt;/b&gt; &amp; &quot;dead&quot;"'
    );
  });

  it.each([
    ["no accDescr line", "flowchart LR\n  A --> B"],
    ["an empty accDescr", "flowchart LR\n  accDescr:   \n  A --> B"],
    ["the block form", "flowchart LR\n  accDescr {\n    A hands off to B\n  }\n  A --> B"]
  ])("refuses a diagram with %s", async (_, source) => {
    const markdown = `Intro\n\n\`\`\`mermaid\nflowchart LR\n  accDescr: First\n  A --> B\n\`\`\`\n\n\`\`\`mermaid\n${source}\n\`\`\`\n`;
    await expect(replaceMermaidFences({ markdown, postLabel: "blog/post" })).rejects.toThrow(
      "blog/post: diagram 2 has no alt text."
    );
  });

  it("returns a post without diagrams unchanged", async () => {
    const md = "# Hi\n\n```js\nlet x = 1;\n```\n";
    expect(await replaceMermaidFences({ markdown: md, postLabel: "post" })).toBe(md);
  });
});
