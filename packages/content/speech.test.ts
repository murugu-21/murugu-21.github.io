import { describe, expect, it } from "vitest";

import { normalizeSpeechText, speechBlocks } from "./speech.ts";

describe("normalizeSpeechText", () => {
  it.each([
    ["strips emoji and pictographs", "0.1+0.2 not equal to 0.3???😕", "0.1+0.2 not equal to 0.3?"],
    ["collapses runs of terminal punctuation", "Really!!! Yes... ok??", "Really! Yes. ok?"],
    ["collapses whitespace and trims", "  a \n  b\t c  ", "a b c"]
  ])("%s", (_, input, spoken) => {
    expect(normalizeSpeechText(input)).toBe(spoken);
  });

  // LLM-style TTS (Breeze) loops on long runs of one digit; spell them out.
  it("describes a long run of one digit in a decimal instead of listing it", () => {
    expect(normalizeSpeechText("0.1 + 0.2 = 0.30000000000000004 in JS")).toBe(
      "0.1 + 0.2 = 0.3, then zero repeated 15 times, then 4 in JS"
    );
    expect(normalizeSpeechText("about 1.999999")).toBe("about 1., then nine repeated 6 times");
  });

  it("leaves ordinary numbers alone", () => {
    expect(normalizeSpeechText("100000 rows, pi is 3.14159, 2.0000 exactly")).toBe(
      "100000 rows, pi is 3.14159, 2.0000 exactly"
    );
  });
});

// Duck-typed DOM: speechBlocks only reads tagName, textContent and children.
type FakeNode = { tagName: string; textContent: string | null; children: FakeNode[] };
const el = (tagName: string, textContent: string, children: FakeNode[] = []): FakeNode => ({
  tagName,
  textContent,
  children
});
const root = (...children: FakeNode[]): FakeNode => ({
  tagName: "SECTION",
  textContent: children.map(c => c.textContent).join(""),
  children
});

describe("speechBlocks", () => {
  it("returns one block per paragraph and heading, keeping the element", () => {
    const h2 = el("H2", "Setup");
    const p = el("P", "Install it first.");
    const blocks = speechBlocks(root(h2, p));
    expect(blocks).toEqual([
      { el: h2, text: "Setup" },
      { el: p, text: "Install it first." }
    ]);
  });

  it("skips code blocks, diagrams and tables", () => {
    const p = el("P", "Prose.");
    const blocks = speechBlocks(
      root(
        el("PRE", "const x = 1;"),
        p,
        el("FIGURE", "graph TD"),
        el("TABLE", "a b c"),
        el("HR", "")
      )
    );
    expect(blocks.map(b => b.text)).toEqual(["Prose."]);
  });

  it("splits lists into one block per item", () => {
    const li1 = el("LI", "First");
    const li2 = el("LI", "Second");
    const blocks = speechBlocks(root(el("UL", "FirstSecond", [li1, li2])));
    expect(blocks).toEqual([
      { el: li1, text: "First" },
      { el: li2, text: "Second" }
    ]);
  });

  it("collapses whitespace and drops empty blocks", () => {
    const p = el("P", "  line one\n   line two  ");
    const blocks = speechBlocks(root(el("P", "   \n "), p));
    expect(blocks).toEqual([{ el: p, text: "line one line two" }]);
  });
});
