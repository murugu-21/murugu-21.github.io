import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";

import { assemble, splice } from "./pcm.ts";

const SR = 8000;
const tone = (seconds: number) => {
  const n = Math.round(SR * seconds);
  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(1000, i * 2);
  return pcm;
};

describe("assemble", () => {
  it("joins chunks with intra gaps, blocks with inter gaps, and reports block timings", () => {
    const { pcm, timings } = assemble([[tone(1), tone(1)], [tone(2)]], SR, {
      intra: 0.5,
      inter: 1
    });
    // 1 + 0.5 + 1 = 2.5 s, a 1 s gap, then 2 s: no gap trails the last block
    expect(pcm.length).toBe(SR * 5.5 * 2);
    expect(pcm.subarray(SR * 2.5 * 2, SR * 3.5 * 2).every(b => b === 0)).toBe(true);
    expect(timings).toEqual([
      { start: 0, end: 2.5 },
      { start: 3.5, end: 5.5 }
    ]);
  });
});

describe("splice", () => {
  const samples = (...values: number[]) => {
    const pcm = Buffer.alloc(values.length * 2);
    values.forEach((v, i) => pcm.writeInt16LE(v, i * 2));
    return pcm;
  };
  const values = (pcm: Buffer) =>
    Array.from({ length: pcm.length / 2 }, (_, i) => pcm.readInt16LE(i * 2));

  it("replaces blocks with longer or shorter audio, keeps the gaps and shifts later blocks", () => {
    // 1000 Hz, so a millisecond is one sample.
    const { pcm, timings } = splice({
      pcm: samples(0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
      sampleRate: 1000,
      blocks: [
        { start: 0, end: 0.003 },
        { start: 0.005, end: 0.007 },
        { start: 0.008, end: 0.01 }
      ],
      replace: new Map([
        [1, samples(50, 51, 52, 53)],
        [2, samples(60)]
      ])
    });
    expect(values(pcm)).toEqual([0, 1, 2, 3, 4, 50, 51, 52, 53, 7, 60]);
    expect(timings).toEqual([
      { start: 0, end: 0.003 },
      { start: 0.005, end: 0.009 },
      { start: 0.01, end: 0.011 }
    ]);
  });
});
