import { describe, expect, it } from "vitest";

import { parseRate, SPEECH_RATES, speechBlocks } from "./speech";

// Minimal duck-typed DOM: speechBlocks only reads tagName, textContent and
// children, so plain objects stand in for Elements and the tests run in the
// workers pool without a DOM shim.
type Node = { tagName: string; textContent: string | null; children: Node[] };
const el = (tagName: string, textContent: string, children: Node[] = []): Node => ({
  tagName,
  textContent,
  children
});
const root = (...children: Node[]): Node => ({
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

describe("parseRate", () => {
  it("accepts a stored rate that is one of the offered speeds", () => {
    expect(parseRate("1.5")).toBe(1.5);
  });

  it("falls back to 1 for missing, garbage or unoffered values", () => {
    expect(parseRate(null)).toBe(1);
    expect(parseRate("fast")).toBe(1);
    expect(parseRate("7")).toBe(1);
  });

  it("offers 1x among the speeds in ascending order", () => {
    expect(SPEECH_RATES).toContain(1);
    expect([...SPEECH_RATES]).toEqual([...SPEECH_RATES].sort((a, b) => a - b));
  });
});
