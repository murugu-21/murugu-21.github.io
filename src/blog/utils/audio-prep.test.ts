import {describe, expect, it} from "vitest";

import {normalizeSpeechText, packSentences, spokenHash} from "./audio-prep";

describe("normalizeSpeechText", () => {
  it("strips emoji and pictographs", () => {
    expect(normalizeSpeechText("0.1+0.2 not equal to 0.3???😕")).toBe(
      "0.1+0.2 not equal to 0.3?"
    );
  });

  it("collapses runs of terminal punctuation to one mark", () => {
    expect(normalizeSpeechText("Really!!! Yes... ok??")).toBe(
      "Really! Yes. ok?"
    );
  });

  it("collapses whitespace and trims", () => {
    expect(normalizeSpeechText("  a \n  b\t c  ")).toBe("a b c");
  });

  it("returns an empty string when only symbols remain", () => {
    expect(normalizeSpeechText("🎉🎉")).toBe("");
  });
});

describe("packSentences", () => {
  it("keeps a short block as one chunk", () => {
    expect(packSentences("One. Two. Three.", 300)).toEqual([
      "One. Two. Three."
    ]);
  });

  it("packs sentences greedily without exceeding max", () => {
    const text = "Alpha beta gamma. Delta epsilon zeta. Eta theta iota.";
    expect(packSentences(text, 40)).toEqual([
      "Alpha beta gamma. Delta epsilon zeta.",
      "Eta theta iota."
    ]);
  });

  it("emits an overlong single sentence on its own", () => {
    const long = "word ".repeat(30).trim() + ".";
    expect(packSentences(`Short one. ${long} Tail.`, 60)).toEqual([
      "Short one.",
      long,
      "Tail."
    ]);
  });

  it("treats ? and ! as sentence ends", () => {
    expect(packSentences("Why? Because! Fine.", 14)).toEqual([
      "Why? Because!",
      "Fine."
    ]);
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
