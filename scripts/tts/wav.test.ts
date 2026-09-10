import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";

import { assemble, readWav, silence, writeWav } from "./wav.ts";

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
  });

  it("rejects non-16-bit audio", () => {
    const wav = writeWav(SR, tone(0.1));
    wav.writeUInt16LE(24, 34); // bits per sample
    expect(() => readWav(wav)).toThrow(/16-bit/);
  });
});

describe("silence", () => {
  it("is zeroed PCM of the requested length", () => {
    const s = silence(SR, 0.25);
    expect(s.length).toBe(SR * 0.25 * 2);
    expect(s.every(b => b === 0)).toBe(true);
  });
});

describe("assemble", () => {
  it("joins chunks with intra gaps, blocks with inter gaps, and reports block timings", () => {
    const { pcm, timings } = assemble(
      [[{ pcm: tone(1) }, { pcm: tone(1) }], [{ pcm: tone(2) }]],
      SR,
      { intra: 0.5, inter: 1 }
    );
    // block 0: 1 + 0.5 + 1 = 2.5 s; gap 1 s; block 1: 2 s → total 5.5 s
    expect(pcm.length).toBe(SR * 5.5 * 2);
    expect(timings).toEqual([
      { start: 0, end: 2.5 },
      { start: 3.5, end: 5.5 }
    ]);
  });

  it("adds no trailing gap after the last block", () => {
    const { pcm } = assemble([[{ pcm: tone(1) }]], SR, {
      intra: 0.5,
      inter: 1
    });
    expect(pcm.length).toBe(SR * 1 * 2);
  });
});
