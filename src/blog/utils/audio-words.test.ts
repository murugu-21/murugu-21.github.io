import {describe, expect, it} from "vitest";
import {parseHTML} from "linkedom";

import {
  alignWords,
  matchWordSpans,
  tokenize,
  wordAt,
  wrapWords
} from "./audio-words";

describe("tokenize", () => {
  it("splits on whitespace runs and keeps punctuation attached", () => {
    expect(tokenize("Hello,  world!\nHow's 0.1+0.2?")).toEqual([
      "Hello,",
      "world!",
      "How's",
      "0.1+0.2?"
    ]);
  });
});

describe("alignWords", () => {
  const block = {start: 10, end: 14};

  it("takes whisper times for words that match", () => {
    const words = alignWords(
      "Hello world again.",
      [
        {word: " Hello", start: 0.1, end: 0.5},
        {word: " world", start: 0.6, end: 1.0},
        {word: " again.", start: 1.2, end: 1.8}
      ],
      block
    );
    expect(words).toEqual([
      {w: "Hello", s: 10.1, e: 10.5},
      {w: "world", s: 10.6, e: 11},
      {w: "again.", s: 11.2, e: 11.8}
    ]);
  });

  it("matches case- and punctuation-insensitively", () => {
    const words = alignWords(
      "Don't worry, it's fine.",
      [
        {word: " don't", start: 0, end: 0.3},
        {word: " worry", start: 0.3, end: 0.6},
        {word: " its", start: 0.7, end: 0.9},
        {word: " fine", start: 0.9, end: 1.3}
      ],
      block
    );
    expect(words?.map(w => w.w)).toEqual(["Don't", "worry,", "it's", "fine."]);
    expect(words?.[2]).toEqual({w: "it's", s: 10.7, e: 10.9});
  });

  it("interpolates words whisper dropped or misheard between neighbours", () => {
    const words = alignWords(
      "one two three four five",
      [
        {word: " one", start: 0, end: 1},
        {word: " four", start: 3, end: 4},
        {word: " five", start: 4, end: 5}
      ],
      block
    );
    expect(words?.map(w => w.w)).toEqual([
      "one",
      "two",
      "three",
      "four",
      "five"
    ]);
    // the gap 1..3 is split evenly between the two unmatched words
    expect(words?.[1]).toEqual({w: "two", s: 11, e: 12});
    expect(words?.[2]).toEqual({w: "three", s: 12, e: 13});
  });

  it("clamps into the block and keeps times monotonic", () => {
    const words = alignWords(
      "alpha beta",
      [
        {word: " alpha", start: -0.2, end: 0.5},
        {word: " beta", start: 0.4, end: 9}
      ],
      block
    );
    expect(words).toEqual([
      {w: "alpha", s: 10, e: 10.5},
      {w: "beta", s: 10.5, e: 14}
    ]);
  });

  it("gives up when too few words match", () => {
    expect(
      alignWords(
        "one two three four five",
        [{word: " banana", start: 0, end: 1}],
        block
      )
    ).toBeNull();
  });
});

describe("wrapWords", () => {
  it("wraps every whitespace-delimited token across inline children, in order", () => {
    const {document} = parseHTML(
      '<p>Use <code>ctrl + i</code> to <a href="#">open</a> it.</p>'
    );
    const p = document.querySelector("p")!;
    const spans = wrapWords(p as unknown as HTMLElement);
    expect(spans.map(s => s.textContent)).toEqual([
      "Use",
      "ctrl",
      "+",
      "i",
      "to",
      "open",
      "it."
    ]);
    expect(p.textContent).toBe("Use ctrl + i to open it.");
    expect(p.querySelector("code")?.textContent).toBe("ctrl + i");
  });

  it("is idempotent", () => {
    const {document} = parseHTML("<p>a b</p>");
    const p = document.querySelector("p")! as unknown as HTMLElement;
    const first = wrapWords(p);
    const second = wrapWords(p);
    expect(second).toEqual(first);
    expect(p.querySelectorAll("span").length).toBe(2);
  });
});

describe("matchWordSpans", () => {
  const span = (text: string) =>
    ({textContent: text}) as unknown as HTMLElement;

  it("pairs spans with words by position when the normalised tokens agree", () => {
    const spans = [span("0.3???"), span("😕"), span("Hey")];
    const words = [
      {w: "0.3?", s: 0, e: 1},
      {w: "Hey", s: 1, e: 2}
    ];
    expect(matchWordSpans(spans, words)).toEqual([spans[0], spans[2]]);
  });

  it("returns null on any mismatch", () => {
    expect(
      matchWordSpans([span("a"), span("b")], [{w: "a", s: 0, e: 1}])
    ).toBeNull();
  });
});

describe("wordAt", () => {
  const words = [
    {w: "a", s: 0, e: 1},
    {w: "b", s: 1, e: 2},
    {w: "c", s: 2.5, e: 3}
  ];
  it("finds the word whose span contains t, or the last started word", () => {
    expect(wordAt(words, 0.5)).toBe(0);
    expect(wordAt(words, 2.2)).toBe(1);
    expect(wordAt(words, 2.9)).toBe(2);
    expect(wordAt(words, -1)).toBe(-1);
  });
});
