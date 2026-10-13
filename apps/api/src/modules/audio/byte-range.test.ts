import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";

import { parseRange } from "#src/modules/audio/byte-range.ts";

describe("parseRange", () => {
  it.each([
    ["bytes=0-9", { offset: 0, length: 10 }],
    ["bytes=90-", { offset: 90, length: 10 }],
    ["bytes=-5", { offset: 95, length: 5 }],
    // An end past the object is clamped to it.
    ["bytes=95-500", { offset: 95, length: 5 }],
    ["bytes=100-", "unsatisfiable"],
    ["bytes=-0", "unsatisfiable"],
    ["bytes=50-20", "unsatisfiable"],
    // A suffix longer than the object is the whole object.
    ["bytes=-500", { offset: 0, length: 100 }],
    ["bytes=-", null],
    ["items=0-1", null],
    [null, null]
  ])("parses %s against a 100-byte object", (header, expected) => {
    expect(parseRange(header, 100)).toEqual(expected);
  });

  it("returns only non-empty ranges inside the object, and serves any byte a range names", () => {
    const position = fc.oneof(
      fc.constant(""),
      fc.nat(300).map(String),
      fc.stringMatching(/^\d{1,25}$/)
    );
    const header = fc.oneof(
      fc.tuple(position, position).map(([first, last]) => `bytes=${first}-${last}`),
      fc.string()
    );
    fc.assert(
      fc.property(header, fc.nat(200), (h, size) => {
        const range = parseRange(h, size);
        if (range === null || range === "unsatisfiable") return;
        expect({
          nonEmpty: range.length >= 1,
          inside: range.offset + range.length <= size
        }).toEqual({
          nonEmpty: true,
          inside: true
        });
      })
    );
    fc.assert(
      fc.property(fc.nat(199), fc.nat(199), (first, extra) => {
        const size = first + 1 + extra;
        expect(parseRange(`bytes=${first}-${first}`, size)).toEqual({ offset: first, length: 1 });
      })
    );
  });
});
