import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";

import { assemble, pcmSeconds, readWav, sharedSampleRate, splice, writeWav } from "./wav.ts";

const SR = 8000;
const tone = (seconds: number) => {
  const n = Math.round(SR * seconds);
  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(1000, i * 2);
  return pcm;
};

describe("wav round trip", () => {
  it("writes a header readWav understands", () => {
    const pcm = tone(0.5);
    const parsed = readWav(writeWav(SR, pcm));
    expect(parsed.sampleRate).toBe(SR);
    expect(parsed.channels).toBe(1);
    expect(parsed.pcm.equals(pcm)).toBe(true);
    expect(pcmSeconds(parsed.pcm, parsed.sampleRate)).toBe(0.5);
  });

  it("rejects non-16-bit audio and files that aren't WAV", () => {
    const wav = writeWav(SR, tone(0.1));
    wav.writeUInt16LE(24, 34); // bits per sample
    expect(() => readWav(wav)).toThrow(/16-bit/);
    expect(() => readWav(Buffer.from("ID3\u0004 an MP3 header"))).toThrow("not a RIFF/WAVE file");
  });
});

describe("assemble", () => {
  it("joins chunks with intra gaps, blocks with inter gaps, and reports block timings", () => {
    const { pcm, timings } = assemble(
      [[{ pcm: tone(1) }, { pcm: tone(1) }], [{ pcm: tone(2) }]],
      SR,
      { intra: 0.5, inter: 1 }
    );
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

describe("sharedSampleRate", () => {
  it("returns the rate every chunk shares, and names the first chunk that differs", () => {
    expect(
      sharedSampleRate([
        { id: "b000-c00", sampleRate: 24000 },
        { id: "b001-c00", sampleRate: 24000 }
      ])
    ).toBe(24000);
    expect(() =>
      sharedSampleRate([
        { id: "b000-c00", sampleRate: 24000 },
        { id: "b001-c00", sampleRate: 22050 }
      ])
    ).toThrow("sample rate mismatch in b001-c00");
    expect(() => sharedSampleRate([])).toThrow("no chunks rendered");
  });
});
