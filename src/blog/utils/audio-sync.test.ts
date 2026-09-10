import { describe, expect, it } from "vitest";

import { blockAt, matchBlocks, scrollTarget } from "./audio-sync";

const timed = [
  { text: "Title", start: 0, end: 2 },
  { text: "First paragraph.", start: 2.5, end: 6 },
  { text: "Second paragraph.", start: 6.4, end: 9 }
];

describe("matchBlocks", () => {
  it("pairs blocks by index when texts are equal", () => {
    const page = [
      { el: "h1", text: "Title" },
      { el: "p1", text: "First paragraph." },
      { el: "p2", text: "Second paragraph." }
    ];
    expect(matchBlocks(page, timed)).toEqual([
      { el: "h1", start: 0, end: 2 },
      { el: "p1", start: 2.5, end: 6 },
      { el: "p2", start: 6.4, end: 9 }
    ]);
  });

  it("leaves a block unhighlighted when its text changed since generation", () => {
    const page = [
      { el: "h1", text: "Title" },
      { el: "p1", text: "First paragraph, edited." },
      { el: "p2", text: "Second paragraph." }
    ];
    const result = matchBlocks(page, timed);
    expect(result[1]).toBeNull();
    expect(result[2]).toEqual({ el: "p2", start: 6.4, end: 9 });
  });

  it("handles a page with more blocks than the timings", () => {
    const page = [
      { el: "h1", text: "Title" },
      { el: "p1", text: "First paragraph." },
      { el: "p2", text: "Second paragraph." },
      { el: "p3", text: "New paragraph." }
    ];
    expect(matchBlocks(page, timed)[3]).toBeNull();
  });
});

describe("blockAt", () => {
  it("returns the block containing the time", () => {
    expect(blockAt(timed, 1)).toBe(0);
    expect(blockAt(timed, 7)).toBe(2);
  });

  it("is inclusive of start and exclusive of end", () => {
    expect(blockAt(timed, 2.5)).toBe(1);
    expect(blockAt(timed, 6)).toBe(-1);
  });

  it("returns -1 in gaps, before the first block and after the last", () => {
    expect(blockAt(timed, 2.2)).toBe(-1);
    expect(blockAt(timed, -1)).toBe(-1);
    expect(blockAt(timed, 20)).toBe(-1);
  });

  it("returns -1 for an empty list", () => {
    expect(blockAt([], 0)).toBe(-1);
  });
});

describe("scrollTarget", () => {
  const vh = 1000;
  const rect = (top: number, height: number) => ({ top, height });

  it("leaves a block alone while its top sits in the reading band", () => {
    expect(scrollTarget(rect(100, 200), vh)).toBeNull();
    expect(scrollTarget(rect(450, 200), vh)).toBeNull();
  });

  it("centres a block that has drifted below the band, long before it leaves the screen", () => {
    expect(scrollTarget(rect(600, 200), vh)).toBe("center");
    expect(scrollTarget(rect(950, 200), vh)).toBe("center");
  });

  it("centres a block that is above the band (a seek backwards)", () => {
    expect(scrollTarget(rect(-50, 200), vh)).toBe("center");
    expect(scrollTarget(rect(40, 200), vh)).toBe("center");
  });

  it("shows the start of a block taller than the screen instead of its middle", () => {
    expect(scrollTarget(rect(700, 1400), vh)).toBe("start");
    expect(scrollTarget(rect(-900, 1400), vh)).toBe("start");
  });

  it("leaves a tall block alone while its start is still near the top", () => {
    expect(scrollTarget(rect(60, 1400), vh)).toBeNull();
  });

  it("takes a wider band for words, so a word only pulls the page when it nears the bottom", () => {
    const words = { top: 0, bottom: 0.8 };
    expect(scrollTarget(rect(0, 24), vh, words)).toBeNull();
    expect(scrollTarget(rect(700, 24), vh, words)).toBeNull();
    expect(scrollTarget(rect(850, 24), vh, words)).toBe("center");
    expect(scrollTarget(rect(-30, 24), vh, words)).toBe("center");
  });
});
