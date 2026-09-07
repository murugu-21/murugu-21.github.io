import {describe, expect, it} from "vitest";

import {blockAt, matchBlocks} from "./audio-sync";

const timed = [
  {text: "Title", start: 0, end: 2},
  {text: "First paragraph.", start: 2.5, end: 6},
  {text: "Second paragraph.", start: 6.4, end: 9}
];

describe("matchBlocks", () => {
  it("pairs blocks by index when texts are equal", () => {
    const page = [
      {el: "h1", text: "Title"},
      {el: "p1", text: "First paragraph."},
      {el: "p2", text: "Second paragraph."}
    ];
    expect(matchBlocks(page, timed)).toEqual([
      {el: "h1", start: 0, end: 2},
      {el: "p1", start: 2.5, end: 6},
      {el: "p2", start: 6.4, end: 9}
    ]);
  });

  it("leaves a block unhighlighted when its text changed since generation", () => {
    const page = [
      {el: "h1", text: "Title"},
      {el: "p1", text: "First paragraph, edited."},
      {el: "p2", text: "Second paragraph."}
    ];
    const result = matchBlocks(page, timed);
    expect(result[1]).toBeNull();
    expect(result[2]).toEqual({el: "p2", start: 6.4, end: 9});
  });

  it("handles a page with more blocks than the timings", () => {
    const page = [
      {el: "h1", text: "Title"},
      {el: "p1", text: "First paragraph."},
      {el: "p2", text: "Second paragraph."},
      {el: "p3", text: "New paragraph."}
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
