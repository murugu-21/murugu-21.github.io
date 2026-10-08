import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import {
  StoredTimings,
  changedBlocks,
  patchedTimings,
  renderedTimings,
  round3,
  storedHash
} from "./timings.ts";
import { pcmSeconds, splice } from "./pcm.ts";

describe("storedHash", () => {
  it("reads the hash a stored render recorded, and none from a malformed object", () => {
    expect(storedHash('{"version":1,"hash":"9f2c"}')).toBe("9f2c");
    expect(storedHash("<html>Not Found</html>")).toBe(null);
  });
});

describe("renderedTimings", () => {
  it("writes version 1 with times rounded to the millisecond", () => {
    const doc = renderedTimings({
      slug: "react",
      hash: "abc",
      voice: "breeze/test",
      sampleRate: 24000,
      duration: 12.34567,
      texts: ["Title", "Body"],
      spans: [
        { start: 0, end: 1.23456 },
        { start: 1.68456, end: 12.34567 }
      ]
    });
    expect(doc).toEqual({
      version: 1,
      slug: "react",
      hash: "abc",
      voice: "breeze/test",
      sampleRate: 24000,
      duration: 12.346,
      blocks: [
        { text: "Title", start: 0, end: 1.235 },
        { text: "Body", start: 1.685, end: 12.346 }
      ]
    });
    expect(() => renderedTimings({ ...doc, duration: 1, texts: ["Title"], spans: [] })).toThrow(
      "block/timing count mismatch"
    );
  });
});

describe("patching stored timings", () => {
  // 1000 Hz, so a millisecond is one sample.
  const stored = StoredTimings.parse(
    JSON.stringify({
      version: 2,
      slug: "react",
      hash: "old",
      voice: "breeze/test",
      sampleRate: 1000,
      duration: 0.01,
      blocks: [
        { text: "Intro.", start: 0, end: 0.003, words: [{ w: "Intro.", s: 0, e: 0.003 }] },
        {
          text: "Old middle.",
          start: 0.005,
          end: 0.007,
          words: [
            { w: "Old", s: 0.005, e: 0.006 },
            { w: "middle.", s: 0.006, e: 0.007 }
          ]
        },
        {
          text: "Out ro.",
          start: 0.008,
          end: 0.01,
          words: [
            { w: "Out", s: 0.008, e: 0.009 },
            { w: "ro.", s: 0.009, e: 0.01 }
          ]
        }
      ]
    })
  );

  it("re-times a longer block, drops its words and shifts the words after it", () => {
    const texts = ["Intro.", "New, longer middle.", "Out ro."];
    const changed = changedBlocks({ slug: "react", stored, texts });
    expect(changed).toEqual([1]);

    const spliced = splice({
      pcm: Buffer.alloc(10 * 2),
      sampleRate: 1000,
      blocks: stored.blocks,
      replace: new Map([[1, Buffer.alloc(4 * 2, 1)]])
    });
    const doc = patchedTimings({
      stored,
      texts,
      hash: "new",
      duration: round3(pcmSeconds(spliced.pcm, 1000)),
      spans: spliced.timings,
      patched: new Set(changed)
    });

    expect(JSON.parse(JSON.stringify(doc))).toEqual({
      version: 2,
      slug: "react",
      hash: "new",
      voice: "breeze/test",
      sampleRate: 1000,
      duration: 0.012,
      blocks: [
        { text: "Intro.", start: 0, end: 0.003, words: [{ w: "Intro.", s: 0, e: 0.003 }] },
        { text: "New, longer middle.", start: 0.005, end: 0.009 },
        {
          text: "Out ro.",
          start: 0.01,
          end: 0.012,
          words: [
            { w: "Out", s: 0.01, e: 0.011 },
            { w: "ro.", s: 0.011, e: 0.012 }
          ]
        }
      ]
    });
  });

  it("refuses a post whose paragraph count changed", () => {
    expect(() => changedBlocks({ slug: "react", stored, texts: ["Intro.", "Out ro."] })).toThrow(
      "block count changed (3 → 2); run `bun run audio react --force`"
    );
  });
});
