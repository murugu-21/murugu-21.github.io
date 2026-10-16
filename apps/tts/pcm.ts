import { Buffer } from "node:buffer";

export const pcmFormat = (sampleRate: number) => [
  "-f",
  "s16le",
  "-ar",
  String(sampleRate),
  "-ac",
  "1"
];

export const pcmSeconds = (pcm: Buffer, sampleRate: number) => pcm.length / 2 / sampleRate;

function silence(sampleRate: number, seconds: number): Buffer {
  return Buffer.alloc(Math.round(sampleRate * seconds) * 2);
}

interface Gaps {
  intra: number;
  inter: number;
}

interface BlockTiming {
  start: number;
  end: number;
}

interface TimedPcm {
  pcm: Buffer;
  timings: BlockTiming[];
}

export function assemble(blocks: Buffer[][], sampleRate: number, gaps: Gaps): TimedPcm {
  const parts: Buffer[] = [];
  const timings: BlockTiming[] = [];
  let samples = 0;
  const push = (buf: Buffer) => {
    parts.push(buf);
    samples += buf.length / 2;
  };
  blocks.forEach((chunks, b) => {
    if (b > 0) push(silence(sampleRate, gaps.inter));
    const start = samples / sampleRate;
    chunks.forEach((chunk, c) => {
      if (c > 0) push(silence(sampleRate, gaps.intra));
      push(chunk);
    });
    timings.push({ start, end: samples / sampleRate });
  });
  return { pcm: Buffer.concat(parts), timings };
}

export function splice({
  pcm,
  sampleRate,
  blocks,
  replace
}: {
  pcm: Buffer;
  sampleRate: number;
  blocks: BlockTiming[];
  replace: ReadonlyMap<number, Buffer>;
}): TimedPcm {
  const byteAt = (seconds: number) => Math.round(seconds * sampleRate) * 2;
  const seconds = (bytes: number) => bytes / 2 / sampleRate;
  const parts: Buffer[] = [];
  const timings: BlockTiming[] = [];
  let cursor = 0;
  let shift = 0;
  blocks.forEach((block, i) => {
    const start = byteAt(block.start);
    const end = byteAt(block.end);
    const replacement = replace.get(i);
    if (!replacement) {
      timings.push({ start: seconds(start + shift), end: seconds(end + shift) });
      return;
    }
    parts.push(pcm.subarray(cursor, start), replacement);
    cursor = end;
    timings.push({
      start: seconds(start + shift),
      end: seconds(start + shift + replacement.length)
    });
    shift += replacement.length - (end - start);
  });
  parts.push(pcm.subarray(cursor));
  return { pcm: Buffer.concat(parts), timings };
}
