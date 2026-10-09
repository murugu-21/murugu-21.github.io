import { assert, describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";

import { blockAt, matchBlocks, scrollTarget, WORD_BAND } from "./audio-sync";
import { matchWordSpans, wordAt, wrapWords } from "./audio-words";
import { parseRate } from "./speech";

describe("parseRate", () => {
  it("accepts a stored rate that is one of the offered speeds", () => {
    expect(parseRate("1.5")).toBe(1.5);
  });

  it("falls back to 1 for missing, garbage or unoffered values", () => {
    expect(parseRate(null)).toBe(1);
    expect(parseRate("fast")).toBe(1);
    expect(parseRate("7")).toBe(1);
  });
});

const timedBlocks = [
  { text: "Title", start: 0, end: 2 },
  { text: "First paragraph.", start: 2.5, end: 6 },
  { text: "Second paragraph.", start: 6.4, end: 9 }
];

describe("matchBlocks", () => {
  it("leaves a block unhighlighted when its text changed since generation", () => {
    const page = [
      { el: "h1", text: "Title" },
      { el: "p1", text: "First paragraph, edited." },
      { el: "p2", text: "Second paragraph." }
    ];
    expect(matchBlocks(page, timedBlocks)).toEqual(["h1", null, "p2"]);
  });

  it("handles a page with more blocks than the timings", () => {
    const page = [
      { el: "h1", text: "Title" },
      { el: "p1", text: "First paragraph." },
      { el: "p2", text: "Second paragraph." },
      { el: "p3", text: "New paragraph." }
    ];
    expect(matchBlocks(page, timedBlocks)).toEqual(["h1", "p1", "p2", null]);
  });
});

describe("blockAt", () => {
  it("returns the block containing the time", () => {
    expect(blockAt(timedBlocks, 1)).toBe(0);
    expect(blockAt(timedBlocks, 7)).toBe(2);
  });

  it("is inclusive of start and exclusive of end", () => {
    expect(blockAt(timedBlocks, 2.5)).toBe(1);
    expect(blockAt(timedBlocks, 6)).toBe(-1);
  });

  it("returns -1 in gaps, before the first block and after the last", () => {
    expect(blockAt(timedBlocks, 2.2)).toBe(-1);
    expect(blockAt(timedBlocks, -1)).toBe(-1);
    expect(blockAt(timedBlocks, 20)).toBe(-1);
  });
});

describe("scrollTarget", () => {
  const vh = 1000;
  const rect = (top: number, height: number) => ({ top, height });

  it("centres a block once it drifts below the reading band, long before it leaves the screen", () => {
    expect(scrollTarget(rect(100, 200), vh)).toBeNull();
    expect(scrollTarget(rect(450, 200), vh)).toBeNull();
    expect(scrollTarget(rect(600, 200), vh)).toBe("center");
    expect(scrollTarget(rect(950, 200), vh)).toBe("center");
  });

  it("centres a block that is above the band (a seek backwards)", () => {
    expect(scrollTarget(rect(-50, 200), vh)).toBe("center");
    expect(scrollTarget(rect(40, 200), vh)).toBe("center");
  });

  it("shows the start of a block taller than the screen, unless it is already near the top", () => {
    expect(scrollTarget(rect(700, 1400), vh)).toBe("start");
    expect(scrollTarget(rect(-900, 1400), vh)).toBe("start");
    expect(scrollTarget(rect(60, 1400), vh)).toBeNull();
  });

  it("takes a wider band for words, so a word only pulls the page when it nears the bottom", () => {
    expect(scrollTarget(rect(0, 24), vh, WORD_BAND)).toBeNull();
    expect(scrollTarget(rect(700, 24), vh, WORD_BAND)).toBeNull();
    expect(scrollTarget(rect(850, 24), vh, WORD_BAND)).toBe("center");
    expect(scrollTarget(rect(-30, 24), vh, WORD_BAND)).toBe("center");
  });
});

describe("wrapWords", () => {
  const paragraph = (html: string) => {
    const p = parseHTML(html).document.querySelector("p");
    assert(p, "fixture has no <p>");
    return p;
  };
  const texts = (words: HTMLElement[][]) =>
    words.map(pieces => pieces.map(p => p.textContent).join(""));

  it("wraps every whitespace-delimited token across inline children, in order", () => {
    const p = paragraph('<p>Use <code>ctrl + i</code> to <a href="#">open</a> it.</p>');
    const words = wrapWords(p);
    expect(texts(words)).toEqual(["Use", "ctrl", "+", "i", "to", "open", "it."]);
    expect(words.every(w => w.length === 1)).toBe(true);
    expect(p.textContent).toBe("Use ctrl + i to open it.");
    expect(p.querySelector("code")?.textContent).toBe("ctrl + i");
  });

  it("keeps a word whole when it straddles an element boundary", () => {
    const p = paragraph(
      '<p><a href="#">SiteGPT</a>’s founder said <strong>place</strong>. Done</p>'
    );
    const words = wrapWords(p);
    expect(texts(words)).toEqual(["SiteGPT’s", "founder", "said", "place.", "Done"]);
    // the straddling words are made of two spans each, one per text node
    expect(words[0].length).toBe(2);
    expect(words[3].length).toBe(2);
    expect(words[1].length).toBe(1);
    expect(p.querySelector("a")?.textContent).toBe("SiteGPT");
    expect(p.textContent).toBe("SiteGPT’s founder said place. Done");
  });

  it("is idempotent, returning the same grouping on a second call", () => {
    const p = paragraph("<p><em>a</em>b c</p>");
    const first = wrapWords(p);
    const second = wrapWords(p);
    expect(texts(first)).toEqual(["ab", "c"]);
    expect(texts(second)).toEqual(["ab", "c"]);
    expect(second.map(w => w.length)).toEqual([2, 1]);
    expect(p.querySelectorAll("span").length).toBe(3);
  });
});

describe("matchWordSpans", () => {
  const { document } = parseHTML("");
  const span = (text: string) => {
    const node = document.createElement("span");
    node.textContent = text;
    return node;
  };

  it("pairs words with timings by position when the normalised tokens agree", () => {
    const words = [[span("0.3???")], [span("😕")], [span("Hey")]];
    const timed = [
      { w: "0.3?", s: 0, e: 1 },
      { w: "Hey", s: 1, e: 2 }
    ];
    expect(matchWordSpans(words, timed)).toEqual([words[0], words[2]]);
  });

  it("joins the pieces of a word before comparing, and returns null on any mismatch", () => {
    const words = [[span("SiteGPT"), span("’s")], [span("founder")]];
    const timed = [
      { w: "SiteGPT’s", s: 0, e: 1 },
      { w: "founder", s: 1, e: 2 }
    ];
    expect(matchWordSpans(words, timed)).toEqual(words);
    expect(matchWordSpans(words, timed.slice(0, 1))).toBeNull();
  });

  // The generator speaks 0.30000000000000004 as "0.3, then zero repeated 15
  // times, then 4": one rendered word, eight timed words. The rendered word
  // is highlighted for the whole run.
  it("maps one rendered word onto the several timed words it expands to", () => {
    const words = [[span("equals")], [span("0.30000000000000004")], [span("here")]];
    const timed = [
      { w: "equals", s: 0, e: 1 },
      { w: "0.3,", s: 1, e: 2 },
      { w: "then", s: 2, e: 3 },
      { w: "zero", s: 3, e: 4 },
      { w: "repeated", s: 4, e: 5 },
      { w: "15", s: 5, e: 6 },
      { w: "times,", s: 6, e: 7 },
      { w: "then", s: 7, e: 8 },
      { w: "4", s: 8, e: 9 },
      { w: "here", s: 9, e: 10 }
    ];
    expect(matchWordSpans(words, timed)).toEqual([
      words[0],
      ...Array<HTMLElement[]>(8).fill(words[1]),
      words[2]
    ]);
    // the expansion must agree with the timings word for word
    const misheard = timed.map(t => (t.w === "zero" ? { ...t, w: "nine" } : t));
    expect(matchWordSpans(words, misheard)).toBeNull();
  });
});

describe("wordAt", () => {
  const words = [
    { w: "a", s: 0, e: 1 },
    { w: "b", s: 1, e: 2 },
    { w: "c", s: 2.5, e: 3 }
  ];
  it("finds the word whose span contains t, or the last started word", () => {
    expect(wordAt(words, 0.5)).toBe(0);
    expect(wordAt(words, 2.2)).toBe(1);
    expect(wordAt(words, 2.9)).toBe(2);
    expect(wordAt(words, -1)).toBe(-1);
  });
});
