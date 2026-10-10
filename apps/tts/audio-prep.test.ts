import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { packSentences, spokenHash } from "./audio-prep.ts";

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

  it("loses no text, overruns max only with one sentence, and leaves no two chunks mergeable", () => {
    const word = fc.stringMatching(/^[a-z]{1,9}$/);
    const sentence = fc
      .tuple(fc.array(word, { minLength: 1, maxLength: 12 }), fc.constantFrom(".", "!", "?"))
      .map(([words, end]) => words.join(" ") + end);
    const firstSentence = (chunk: string) => chunk.slice(0, chunk.search(/[.!?]/) + 1);
    fc.assert(
      fc.property(
        fc.array(sentence, { minLength: 1, maxLength: 20 }),
        fc.nat(120),
        (sentences, max) => {
          const text = sentences.join(" ");
          const chunks = packSentences(text, max);
          expect(chunks.join(" ")).toBe(text);
          expect({
            overlong: chunks.filter(c => c.length > max && !sentences.includes(c)),
            mergeable: chunks
              .slice(1)
              .filter((c, i) => chunks[i].length + 1 + firstSentence(c).length <= max)
          }).toEqual({ overlong: [], mergeable: [] });
        }
      )
    );
  });
});

describe("spokenHash", () => {
  it("hashes the spoken texts, and changes when a block changes", () => {
    expect(spokenHash(["Hello.", "World."])).toBe(
      "7d13afdeb11f0525de841ec656b6519daa6bce7b8abd6a7c3682b30c54b01c45"
    );
    expect(spokenHash(["Hello.", "World!"])).toBe(
      "5205687253ec22df1f1e4bcbd38c27691c5c2d2f4521df5cf81345d81eb7a7d8"
    );
  });
});
