// Minimal 16-bit PCM WAV helpers so the orchestrator can join chunks with
// sample-accurate gaps and derive block timings from byte counts, instead of
// trusting ffmpeg's rounded durations.
import { Buffer } from "node:buffer";

export interface Wav {
  sampleRate: number;
  channels: number;
  pcm: Buffer;
}

export function readWav(buffer: Buffer): Wav {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a RIFF/WAVE file");
  }
  let offset = 12;
  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | null = null;
  let pcm: Buffer | null = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      fmt = {
        format: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bits: buffer.readUInt16LE(body + 14)
      };
    } else if (id === "data") {
      pcm = buffer.subarray(body, Math.min(body + size, buffer.length));
    }
    offset = body + size + (size % 2);
  }
  if (!fmt || !pcm) throw new Error("WAV missing fmt or data chunk");
  if (fmt.format !== 1 || fmt.bits !== 16) {
    throw new Error("only 16-bit PCM WAV is supported");
  }
  return { sampleRate: fmt.sampleRate, channels: fmt.channels, pcm };
}

export function writeWav(sampleRate: number, pcm: Buffer, channels = 1): Buffer {
  const header = Buffer.alloc(44);
  const blockAlign = channels * 2;
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function silence(sampleRate: number, seconds: number): Buffer {
  return Buffer.alloc(Math.round(sampleRate * seconds) * 2);
}

export interface Gaps {
  intra: number;
  inter: number;
}

export interface BlockTiming {
  start: number;
  end: number;
}

// Chunks inside a block are joined with `intra` seconds of silence, blocks
// with `inter`. Returns the joined PCM and one {start, end} per block, in
// seconds, exact from the sample counts.
export function assemble(
  blocks: { pcm: Buffer }[][],
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
      push(chunk.pcm);
    });
    timings.push({ start, end: samples / sampleRate });
  });
  return { pcm: Buffer.concat(parts), timings };
}
