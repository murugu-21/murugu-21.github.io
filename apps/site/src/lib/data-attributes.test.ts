import { describe, expect, it } from "vite-plus/test";

import { parseStringArray } from "./data-attributes";

describe("parseStringArray", () => {
  it.each([
    ['["react","astro"]', ["react", "astro"]],
    ["not json", []],
    ['{"a":1}', []],
    ['["a",1]', []],
    ["null", []]
  ])("decodes %s as %j", (json, expected) => {
    expect(parseStringArray(json)).toEqual(expected);
  });
});
