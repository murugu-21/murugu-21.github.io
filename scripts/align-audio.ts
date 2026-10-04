// Adds word-level timings to the read-aloud JSON in R2. Runs after
// `bun run audio`; never re-synthesises:
//
//   bun run audio:align              # every post whose JSON is still version 1
//   bun run audio:align first-post   # one post
//   bun run audio:align --force      # re-align version 2 posts too
//   bun run audio:align --local      # target the local R2 that `bun run dev` serves
//
// Poorly aligned blocks keep no `words` (paragraph highlight only).
// Don't run alongside `bun run audio`: both want the GPU.
import { mkdtempDisposableSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";

import { jsonString } from "#utils/json.ts";

import { alignWords, type TimedWord } from "#src/blog/utils/audio-words.ts";
import {
  PYTHON,
  ROOT,
  ffmpeg,
  publishedSlugs,
  requireFfmpeg,
  requirePython,
  runEach
} from "./tts/cli.ts";
import { startJsonLines } from "./tts/json-lines.ts";
import { AUDIO_PREFIX, r2Store } from "./tts/r2.ts";

const WORKER = join(ROOT, "scripts", "tts", "whisper.py");

const { values: options, positionals: slugs } = parseArgs({
  allowPositionals: true,
  options: { force: { type: "boolean" }, local: { type: "boolean" } }
});
const r2 = r2Store(options.local ?? false);

const WhisperReply = z.object({
  error: z.string().optional(),
  words: z.array(z.object({ word: z.string(), start: z.number(), end: z.number() })).optional()
});
type WhisperReply = z.infer<typeof WhisperReply>;

function startWorker() {
  const { next, send, close } = startJsonLines(PYTHON, [WORKER]);
  return {
    async transcribe(job: { id: string; wav: string; text: string }): Promise<WhisperReply> {
      send(JSON.stringify(job));
      return WhisperReply.parse(await next());
    },
    [Symbol.asyncDispose]: close
  };
}

type Worker = ReturnType<typeof startWorker>;

// Version 1 from generate-audio.ts, version 2 adds words; mirrors
// src/blog/utils/audio-sync.ts.
interface TimingBlock {
  text: string;
  start: number;
  end: number;
  words?: TimedWord[];
}
// Loose, so every field round-trips untouched.
const Timings = jsonString(
  z.looseObject({
    version: z.number(),
    blocks: z.array(z.looseObject({ text: z.string(), start: z.number(), end: z.number() }))
  })
);

async function alignPost(slug: string, worker: Worker) {
  const stored = r2.get(`${AUDIO_PREFIX}/${slug}.json`);
  if (!stored) {
    console.log(`${slug}: no audio in R2, skipping`);
    return;
  }
  const timings = Timings.parse(stored.toString());
  if (timings.version >= 2 && !options.force) {
    console.log(`${slug}: already aligned, skipping`);
    return;
  }
  const mp3Body = r2.get(`${AUDIO_PREFIX}/${slug}.mp3`);
  if (!mp3Body) throw new Error("mp3 missing in R2");

  using tmp = mkdtempDisposableSync(join(tmpdir(), `align-${slug}-`));
  const mp3 = join(tmp.path, "post.mp3");
  const wav = join(tmp.path, "post.wav");
  writeFileSync(mp3, mp3Body);
  ffmpeg(["-i", mp3, "-ac", "1", "-ar", "16000", wav]);

  let aligned = 0;
  const blocks: TimingBlock[] = [];
  for (const [i, block] of timings.blocks.entries()) {
    const slice = join(tmp.path, `b${i}.wav`);
    ffmpeg(["-ss", String(block.start), "-to", String(block.end), "-i", wav, slice]);
    const reply = await worker.transcribe({ id: `b${i}`, wav: slice, text: block.text });
    const { words: _drop, ...rest } = block;
    if (reply.error) {
      console.log(`  b${i}: whisper failed: ${reply.error}`);
      blocks.push(rest);
      continue;
    }
    const whisperWords = reply.words ?? [];
    const words = alignWords(block.text, whisperWords, block);
    if (!words) {
      console.log(`  b${i}: poor match (${whisperWords.length} whisper words), paragraph only`);
      blocks.push(rest);
      continue;
    }
    aligned++;
    blocks.push({ ...rest, words });
  }

  const jsonPath = join(tmp.path, "timings.json");
  writeFileSync(jsonPath, JSON.stringify({ ...timings, version: 2, blocks }));
  r2.put(`${AUDIO_PREFIX}/${slug}.json`, jsonPath, "application/json");
  console.log(`${slug}: aligned ${aligned}/${blocks.length} blocks`);
}

requirePython("mlx_whisper");
requireFfmpeg();
r2.checkLogin();
const targets = slugs.length ? slugs : publishedSlugs();
await using worker = startWorker();
const failures = await runEach(targets, slug => alignPost(slug, worker));
if (failures.length) process.exitCode = 1;
