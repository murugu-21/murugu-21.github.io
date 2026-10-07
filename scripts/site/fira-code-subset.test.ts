import { expect, it } from "vitest";

import { unicodeRangeText } from "./fira-code-subset.ts";

it("expands a unicode-range list into the characters it covers", () => {
  expect(unicodeRangeText("U+0041-0043,U+2190,U+00E9")).toBe("ABC←é");
});
