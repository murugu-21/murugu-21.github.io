import { describe, expect, it } from "vitest";

import { StoredTimings, changedBlocks, renderedTimings, storedHash } from "./timings.ts";

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

describe("changedBlocks", () => {
  it("refuses a post whose paragraph count changed", () => {
    const stored = StoredTimings.parse(
      JSON.stringify({
        version: 1,
        sampleRate: 1000,
        duration: 0.01,
        blocks: [
          { text: "Intro.", start: 0, end: 0.003 },
          { text: "Middle.", start: 0.005, end: 0.007 },
          { text: "Out ro.", start: 0.008, end: 0.01 }
        ]
      })
    );
    expect(() => changedBlocks({ slug: "react", stored, texts: ["Intro.", "Out ro."] })).toThrow(
      "block count changed (3 → 2); run `bun run audio react --force`"
    );
  });
});
