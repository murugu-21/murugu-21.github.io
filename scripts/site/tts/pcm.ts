// Raw 16-bit mono PCM helpers: sample-accurate joins and timings, instead of
// trusting ffmpeg's rounded durations.
import { Buffer } from "node:buffer";

// ffmpeg flags for headerless signed 16-bit little-endian mono PCM: before `-i`
// they describe the input, before the output path they describe the output.
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

// Joins chunks with `intra` seconds of silence and blocks with `inter`;
// timings are per block, in seconds.
export function assemble(
  blocks: Buffer[][],
  sampleRate: number,
  gaps: Gaps
): { pcm: Buffer; timings: BlockTiming[] } {
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

// `replace` is keyed by block index. The gaps between blocks are kept.
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
}): { pcm: Buffer; timings: BlockTiming[] } {
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
