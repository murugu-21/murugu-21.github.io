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

import {
  PYTHON,
  alignArgs,
  ffmpeg,
  publishedSlugs,
  requireFfmpeg,
  requirePython,
  runEach
} from "./tts/cli.ts";
import { startJsonLines } from "./tts/json-lines.ts";
import { AUDIO_PREFIX } from "#contracts/audio.ts";
import { r2Store } from "./tts/r2.ts";
import { alignBlock, whisperClient } from "./tts/align.ts";
import { StoredTimings, type StoredBlock } from "./tts/timings.ts";

const WORKER = join(import.meta.dirname, "tts", "whisper.py");

const options = alignArgs(process.argv.slice(2));
const r2 = r2Store(options.local);

type Worker = ReturnType<typeof whisperClient>;

async function alignPost(slug: string, worker: Worker) {
  const stored = r2.get(`${AUDIO_PREFIX}/${slug}.json`);
  if (!stored) {
    console.log(`${slug}: no audio in R2, skipping`);
    return;
  }
  const timings = StoredTimings.parse(stored.toString());
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

  const blocks: StoredBlock[] = [];
  for (const [i, block] of timings.blocks.entries()) {
    const slice = join(tmp.path, `b${i}.wav`);
    ffmpeg(["-ss", String(block.start), "-to", String(block.end), "-i", wav, slice]);
    const reply = await worker.transcribe({ id: `b${i}`, wav: slice, text: block.text });
    const result = alignBlock(block, reply);
    if (result.problem) console.log(`  b${i}: ${result.problem}`);
    blocks.push(result.block);
  }

  const jsonPath = join(tmp.path, "timings.json");
  writeFileSync(jsonPath, JSON.stringify({ ...timings, version: 2, blocks }));
  r2.put({ key: `${AUDIO_PREFIX}/${slug}.json`, file: jsonPath, contentType: "application/json" });
  const aligned = blocks.filter(block => block.words).length;
  console.log(`${slug}: aligned ${aligned}/${blocks.length} blocks`);
}

requirePython("mlx_whisper");
requireFfmpeg();
r2.checkLogin();
const targets = options.slugs.length ? options.slugs : publishedSlugs();
await using worker = whisperClient(startJsonLines(PYTHON, [WORKER]));
const failures = await runEach(targets, slug => alignPost(slug, worker));
if (failures.length) process.exitCode = 1;
