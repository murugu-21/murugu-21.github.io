import { describe, expect, it } from "vite-plus/test";

import { accentTitle } from "./accent";

describe("accentTitle", () => {
  it("accents the last word", () => {
    expect(accentTitle("Work Experience")).toEqual({
      before: "Work ",
      accent: "Experience",
      after: ""
    });
  });

  it("keeps every earlier word, single-spaced, before the accent", () => {
    expect(accentTitle("  Reach Out to me! ")).toEqual({
      before: "Reach Out to ",
      accent: "me!",
      after: ""
    });
  });

  it("skips trailing emoji to accent the last word with letters", () => {
    expect(accentTitle("Open Source 🛠️")).toEqual({
      before: "Open ",
      accent: "Source",
      after: " 🛠️"
    });
  });

  it("leaves a title without letters unaccented", () => {
    expect(accentTitle("2024")).toEqual({ before: "2024", accent: "", after: "" });
  });
});
