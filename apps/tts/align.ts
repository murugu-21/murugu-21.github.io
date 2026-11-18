import { mkdtempDisposable, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { alignWords } from "./align-words.ts";
import type { Ffmpeg } from "./cli.ts";
import type { JsonLines } from "./json-lines.ts";
import { type R2Store, audioKey } from "./r2.ts";
import { StoredTimings, type StoredBlock } from "./timings.ts";

const AlignerReply = z.object({
  error: z.string().optional(),
  words: z.array(z.object({ word: z.string(), start: z.number(), end: z.number() })).optional()
});
type AlignerReply = z.infer<typeof AlignerReply>;

export function alignerClient({ next, send, close }: JsonLines) {
  return {
    async align(job: { id: string; wav: string; text: string }): Promise<AlignerReply> {
      send(JSON.stringify(job));
      return next(AlignerReply);
    },
    [Symbol.asyncDispose]: close
  };
}

export type AlignerClient = ReturnType<typeof alignerClient>;

type Alignment = { block: StoredBlock; problem?: string };

export function alignBlock(block: StoredBlock, reply: AlignerReply): Alignment {
  const { words: _drop, ...rest } = block;
  if (reply.error) return { block: rest, problem: `aligner failed: ${reply.error}` };
  const alignerWords = reply.words ?? [];
  const words = alignWords(block.text, alignerWords, block);
  if (!words) {
    return {
      block: rest,
      problem: `poor match (${alignerWords.length} aligned words), paragraph only`
    };
  }
  return { block: { ...rest, words } };
}

export async function alignPost(
  { r2, ffmpeg }: { r2: Pick<R2Store, "get" | "put">; ffmpeg: Ffmpeg },
  { slug, aligner, force }: { slug: string; aligner: Pick<AlignerClient, "align">; force: boolean }
) {
  const stored = await r2.get(audioKey(slug, "json"));
  if (!stored) {
    console.log(`${slug}: no audio in R2, skipping`);
    return;
  }
  const timings = StoredTimings.parse(stored.toString());
  if (timings.version >= 2 && !force) {
    console.log(`${slug}: already aligned, skipping`);
    return;
  }
  const mp3Body = await r2.get(audioKey(slug, "mp3"));
  if (!mp3Body) throw new Error("mp3 missing in R2");

  await using tmp = await mkdtempDisposable(join(tmpdir(), `align-${slug}-`));
  const mp3 = join(tmp.path, "post.mp3");
  const wav = join(tmp.path, "post.wav");
  await writeFile(mp3, mp3Body);
  await ffmpeg(["-i", mp3, "-ac", "1", "-ar", "16000", wav]);

  const blocks: StoredBlock[] = [];
  for (const [i, block] of timings.blocks.entries()) {
    const slice = join(tmp.path, `b${i}.wav`);
    await ffmpeg(["-ss", String(block.start), "-to", String(block.end), "-i", wav, slice]);
    const reply = await aligner.align({ id: `b${i}`, wav: slice, text: block.text });
    const result = alignBlock(block, reply);
    if (result.problem) console.log(`  b${i}: ${result.problem}`);
    blocks.push(result.block);
  }

  const jsonPath = join(tmp.path, "timings.json");
  await writeFile(jsonPath, JSON.stringify({ ...timings, version: 2, blocks }));
  await r2.put({ key: audioKey(slug, "json"), file: jsonPath, contentType: "application/json" });
  const aligned = blocks.filter(block => block.words).length;
  console.log(`${slug}: aligned ${aligned}/${blocks.length} blocks`);
}
