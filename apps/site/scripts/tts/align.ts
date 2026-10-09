// align-audio.ts's side of whisper.py, what each reply does to a block, and
// the pass that adds word timings to one post's JSON in R2.
import { mkdtempDisposableSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { alignWords } from "#src/lib/blog/audio-words.ts";
import type { Ffmpeg } from "./cli.ts";
import type { JsonLines } from "./json-lines.ts";
import { type R2Store, audioKey } from "./r2.ts";
import { StoredTimings, type StoredBlock } from "./timings.ts";

const WhisperReply = z.object({
  error: z.string().optional(),
  words: z.array(z.object({ word: z.string(), start: z.number(), end: z.number() })).optional()
});
type WhisperReply = z.infer<typeof WhisperReply>;

export function whisperClient({ next, send, close }: JsonLines) {
  return {
    async transcribe(job: { id: string; wav: string; text: string }): Promise<WhisperReply> {
      send(JSON.stringify(job));
      return WhisperReply.parse(await next());
    },
    [Symbol.asyncDispose]: close
  };
}

export type WhisperClient = ReturnType<typeof whisperClient>;

// A block whisper failed on, or matched poorly, keeps no `words` (paragraph
// highlight only), and `problem` says why.
export function alignBlock(
  block: StoredBlock,
  reply: WhisperReply
): { block: StoredBlock; problem?: string } {
  const { words: _drop, ...rest } = block;
  if (reply.error) return { block: rest, problem: `whisper failed: ${reply.error}` };
  const whisperWords = reply.words ?? [];
  const words = alignWords(block.text, whisperWords, block);
  if (!words) {
    return {
      block: rest,
      problem: `poor match (${whisperWords.length} whisper words), paragraph only`
    };
  }
  return { block: { ...rest, words } };
}

// Rewrites the post's JSON as version 2. Skips a version 2 post unless `force`.
export async function alignPost(
  { r2, ffmpeg }: { r2: Pick<R2Store, "get" | "put">; ffmpeg: Ffmpeg },
  {
    slug,
    whisper,
    force
  }: { slug: string; whisper: Pick<WhisperClient, "transcribe">; force: boolean }
) {
  const stored = r2.get(audioKey(slug, "json"));
  if (!stored) {
    console.log(`${slug}: no audio in R2, skipping`);
    return;
  }
  const timings = StoredTimings.parse(stored.toString());
  if (timings.version >= 2 && !force) {
    console.log(`${slug}: already aligned, skipping`);
    return;
  }
  const mp3Body = r2.get(audioKey(slug, "mp3"));
  if (!mp3Body) throw new Error("mp3 missing in R2");

  using tmp = mkdtempDisposableSync(join(tmpdir(), `align-${slug}-`));
  const mp3 = join(tmp.path, "post.mp3");
  const wav = join(tmp.path, "post.wav");
  writeFileSync(mp3, mp3Body);
  ffmpeg(["-i", mp3, "-ac", "1", "-ar", "16000", wav]);

  const blocks: StoredBlock[] = [];
  for (const [i, block] of timings.blocks.entries()) {
    const slice = join(tmp.path, `b${i}.wav`);
    ffmpeg(["-ss", String(block.start), "-to", String(block.end), "-i", wav, slice]);
    const reply = await whisper.transcribe({ id: `b${i}`, wav: slice, text: block.text });
    const result = alignBlock(block, reply);
    if (result.problem) console.log(`  b${i}: ${result.problem}`);
    blocks.push(result.block);
  }

  const jsonPath = join(tmp.path, "timings.json");
  writeFileSync(jsonPath, JSON.stringify({ ...timings, version: 2, blocks }));
  r2.put({ key: audioKey(slug, "json"), file: jsonPath, contentType: "application/json" });
  const aligned = blocks.filter(block => block.words).length;
  console.log(`${slug}: aligned ${aligned}/${blocks.length} blocks`);
}
