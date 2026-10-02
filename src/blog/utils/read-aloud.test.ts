import { assert, describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";

import { normalizeSpeechText, packSentences, spokenHash } from "./audio-prep";
import { blockAt, matchBlocks, scrollTarget, WORD_BAND } from "./audio-sync";
import { alignWords, matchWordSpans, tokenize, wordAt, wrapWords } from "./audio-words";
import { parseRate, speechBlocks } from "./speech";

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

describe("packSentences", () => {
  it("packs sentences greedily without exceeding max", () => {
    const text = "Alpha beta gamma. Delta epsilon zeta. Eta theta iota.";
    expect(packSentences(text, 40)).toEqual([
      "Alpha beta gamma. Delta epsilon zeta.",
      "Eta theta iota."
    ]);
  });

  it("emits an overlong single sentence on its own", () => {
    const long = "word ".repeat(30).trim() + ".";
    expect(packSentences(`Short one. ${long} Tail.`, 60)).toEqual(["Short one.", long, "Tail."]);
  });

  it("treats ? and ! as sentence ends", () => {
    expect(packSentences("Why? Because! Fine.", 14)).toEqual(["Why? Because!", "Fine."]);
  });
});

describe("spokenHash", () => {
  it("is stable for the same texts and differs when a block changes", async () => {
    const a = await spokenHash(["Hello.", "World."]);
    const b = await spokenHash(["Hello.", "World."]);
    const c = await spokenHash(["Hello.", "World!"]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
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
  it("pairs blocks by index when texts are equal", () => {
    const page = [
      { el: "h1", text: "Title" },
      { el: "p1", text: "First paragraph." },
      { el: "p2", text: "Second paragraph." }
    ];
    expect(matchBlocks(page, timedBlocks)).toEqual([
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
    const result = matchBlocks(page, timedBlocks);
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
    expect(matchBlocks(page, timedBlocks)[3]).toBeNull();
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
    expect(scrollTarget(rect(0, 24), vh, WORD_BAND)).toBeNull();
    expect(scrollTarget(rect(700, 24), vh, WORD_BAND)).toBeNull();
    expect(scrollTarget(rect(850, 24), vh, WORD_BAND)).toBe("center");
    expect(scrollTarget(rect(-30, 24), vh, WORD_BAND)).toBe("center");
  });
});

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

  it("gives up when too few words match", () => {
    expect(
      alignWords("one two three four five", [{ word: " banana", start: 0, end: 1 }], block)
    ).toBeNull();
  });
});

describe("wrapWords", () => {
  const paragraph = (html: string) => {
    const p = parseHTML(html).document.querySelector("p");
    assert(p, "fixture has no <p>");
    return p as unknown as HTMLElement;
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
    expect(texts(second)).toEqual(["ab", "c"]);
    expect(second.map(w => w.length)).toEqual(first.map(w => w.length));
    expect(p.querySelectorAll("span").length).toBe(3);
  });
});

describe("matchWordSpans", () => {
  const span = (text: string) => ({ textContent: text }) as unknown as HTMLElement;

  it("pairs words with timings by position when the normalised tokens agree", () => {
    const words = [[span("0.3???")], [span("😕")], [span("Hey")]];
    const timed = [
      { w: "0.3?", s: 0, e: 1 },
      { w: "Hey", s: 1, e: 2 }
    ];
    expect(matchWordSpans(words, timed)).toEqual([words[0], words[2]]);
  });

  it("joins the pieces of a word before comparing", () => {
    const words = [[span("SiteGPT"), span("’s")], [span("founder")]];
    const timed = [
      { w: "SiteGPT’s", s: 0, e: 1 },
      { w: "founder", s: 1, e: 2 }
    ];
    expect(matchWordSpans(words, timed)).toEqual(words);
  });

  it("returns null on any mismatch", () => {
    expect(matchWordSpans([[span("a")], [span("b")]], [{ w: "a", s: 0, e: 1 }])).toBeNull();
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
    const spans = matchWordSpans(words, timed);
    assert(spans);
    expect(spans).toHaveLength(timed.length);
    expect(spans[0]).toEqual(words[0]);
    for (let k = 1; k <= 8; k++) expect(spans[k]).toEqual(words[1]);
    expect(spans[9]).toEqual(words[2]);
  });

  it("still returns null when an expanded word disagrees with the timings", () => {
    const words = [[span("0.30000000000000004")]];
    expect(
      matchWordSpans(words, [
        { w: "0.3,", s: 0, e: 1 },
        { w: "then", s: 1, e: 2 },
        { w: "nine", s: 2, e: 3 }
      ])
    ).toBeNull();
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
