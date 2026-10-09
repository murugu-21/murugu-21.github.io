import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { alignWords } from "./align-words.ts";

describe("alignWords", () => {
  const block = { start: 10, end: 14 };

  it("takes whisper times for words that match", () => {
    const words = alignWords(
      "Hello world again.",
      [
        { word: " Hello", start: 0.1, end: 0.5 },
        { word: " world", start: 0.6, end: 1.0 },
        { word: " again.", start: 1.2, end: 1.8 }
      ],
      block
    );
    expect(words).toEqual([
      { w: "Hello", s: 10.1, e: 10.5 },
      { w: "world", s: 10.6, e: 11 },
      { w: "again.", s: 11.2, e: 11.8 }
    ]);
  });

  it("matches case- and punctuation-insensitively", () => {
    const words = alignWords(
      "Don't worry, it's fine.",
      [
        { word: " don't", start: 0, end: 0.3 },
        { word: " worry", start: 0.3, end: 0.6 },
        { word: " its", start: 0.7, end: 0.9 },
        { word: " fine", start: 0.9, end: 1.3 }
      ],
      block
    );
    expect(words?.map(w => w.w)).toEqual(["Don't", "worry,", "it's", "fine."]);
    expect(words?.[2]).toEqual({ w: "it's", s: 10.7, e: 10.9 });
  });

  it("interpolates words whisper dropped or misheard between neighbours", () => {
    const words = alignWords(
      "one two three four five",
      [
        { word: " one", start: 0, end: 1 },
        { word: " four", start: 3, end: 4 },
        { word: " five", start: 4, end: 5 }
      ],
      block
    );
    expect(words?.map(w => w.w)).toEqual(["one", "two", "three", "four", "five"]);
    // the gap 1..3 is split evenly between the two unmatched words
    expect(words?.[1]).toEqual({ w: "two", s: 11, e: 12 });
    expect(words?.[2]).toEqual({ w: "three", s: 12, e: 13 });
  });

  it("skips a word whisper heard that the text lacks", () => {
    const words = alignWords(
      "one two three",
      [
        { word: " one", start: 0, end: 1 },
        { word: " uh", start: 1, end: 1.5 },
        { word: " two", start: 1.5, end: 2 },
        { word: " three", start: 2, end: 3 }
      ],
      block
    );
    expect(words).toEqual([
      { w: "one", s: 10, e: 11 },
      { w: "two", s: 11.5, e: 12 },
      { w: "three", s: 12, e: 13 }
    ]);
  });

  it("spreads unmatched words at either edge to the block's start and end", () => {
    const words = alignWords(
      "So one two three far",
      [
        { word: " one", start: 1, end: 2 },
        { word: " two", start: 2, end: 3 },
        { word: " three", start: 3, end: 3.5 }
      ],
      block
    );
    expect(words?.[0]).toEqual({ w: "So", s: 10, e: 11 });
    expect(words?.[4]).toEqual({ w: "far", s: 13.5, e: 14 });
  });

  it("times every word of the text inside the block, in order, whatever whisper heard", () => {
    const word = fc.stringMatching(/^[a-z]{1,8}$/);
    const time = fc.double({ min: -2, max: 6, noNaN: true });
    const heardAt = fc
      .tuple(time, time)
      .map(([a, b]) => ({ start: Math.min(a, b), end: Math.max(a, b) }));
    // Whisper keeps at least three in five of the text's words, in order, and may add its own.
    const row = fc.record({
      word,
      kept: fc.boolean(),
      extra: fc.option(word),
      at: heardAt,
      extraAt: heardAt
    });
    const rows = fc
      .array(row, { minLength: 1, maxLength: 30 })
      .filter(all => all.filter(r => r.kept).length >= all.length * 0.6);
    fc.assert(
      fc.property(rows, all => {
        const tokens = all.map(r => r.word);
        const whisper = all.flatMap(r => [
          ...(r.kept ? [{ word: ` ${r.word}`, ...r.at }] : []),
          ...(r.extra ? [{ word: ` ${r.extra}`, ...r.extraAt }] : [])
        ]);
        const words = alignWords(tokens.join(" "), whisper, block) ?? [];
        expect(words.map(w => w.w)).toEqual(tokens);
        expect(
          words.filter(
            (w, i) => w.s < 10 || w.e > 14 || w.e < w.s || (i > 0 && w.s < words[i - 1].e)
          )
        ).toEqual([]);
      })
    );
  });

  it("clamps into the block and keeps times monotonic", () => {
    const words = alignWords(
      "alpha beta",
      [
        { word: " alpha", start: -0.2, end: 0.5 },
        { word: " beta", start: 0.4, end: 9 }
      ],
      block
    );
    expect(words).toEqual([
      { w: "alpha", s: 10, e: 10.5 },
      { w: "beta", s: 10.5, e: 14 }
    ]);
  });

  it("gives up when fewer than three in five words match", () => {
    const one = { word: " one", start: 0, end: 1 };
    const four = { word: " four", start: 3, end: 4 };
    const five = { word: " five", start: 4, end: 5 };
    expect(alignWords("one two three four five", [one, four], block)).toBeNull();
    expect(alignWords("one two three four five", [one, four, five], block)?.length).toBe(5);
  });
});
