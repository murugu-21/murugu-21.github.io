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
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { alignWords, type TimedWord, type WhisperWord } from "../src/blog/utils/audio-words.ts";
import {
  PYTHON,
  ROOT,
  fail,
  flags,
  log,
  publishedSlugs,
  run,
  runEach,
  runMain,
  slugs
} from "./tts/cli.ts";
import { startJsonLines } from "./tts/json-lines.ts";
import { AUDIO_PREFIX, r2Store } from "./tts/r2.ts";

const WORKER = join(ROOT, "scripts", "tts", "whisper.py");

const r2 = r2Store(flags.has("--local"));

interface WhisperReply {
  error?: string;
  words?: WhisperWord[];
}

function startWorker() {
  const { next, send, close } = startJsonLines(PYTHON, [WORKER]);
  return {
    async transcribe(job: { id: string; wav: string; text: string }): Promise<WhisperReply> {
      send(JSON.stringify(job));
      return (await next()) as WhisperReply;
    },
    close
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
interface Timings {
  version: number;
  blocks: TimingBlock[];
}

async function alignPost(slug: string, worker: Worker) {
  const tmp = mkdtempSync(join(tmpdir(), `align-${slug}-`));
  try {
    const jsonPath = join(tmp, "timings.json");
    const mp3 = join(tmp, "post.mp3");
    if (!r2.get(`${AUDIO_PREFIX}/${slug}.json`, jsonPath)) {
      log(`${slug}: no audio in R2, skipping`);
      return "skipped";
    }
    const timings = JSON.parse(readFileSync(jsonPath, "utf8")) as Timings;
    if (timings.version >= 2 && !flags.has("--force")) {
      log(`${slug}: already aligned, skipping`);
      return "skipped";
    }
    if (!r2.get(`${AUDIO_PREFIX}/${slug}.mp3`, mp3)) throw new Error("mp3 missing in R2");

    const wav = join(tmp, "post.wav");
    run("ffmpeg", ["-y", "-loglevel", "error", "-i", mp3, "-ac", "1", "-ar", "16000", wav]);

    let aligned = 0;
    const blocks: TimingBlock[] = [];
    for (const [i, block] of timings.blocks.entries()) {
      const slice = join(tmp, `b${i}.wav`);
      run("ffmpeg", [
        "-y",
        "-loglevel",
        "error",
        "-ss",
        String(block.start),
        "-to",
        String(block.end),
        "-i",
        wav,
        slice
      ]);
      const reply = await worker.transcribe({
        id: `b${i}`,
        wav: slice,
        text: block.text
      });
      const { words: _drop, ...rest } = block;
      if (reply.error) {
        log(`  b${i}: whisper failed — ${reply.error}`);
        blocks.push(rest);
        continue;
      }
      const whisperWords = reply.words ?? [];
      const words = alignWords(block.text, whisperWords, block);
      if (!words) {
        log(`  b${i}: poor match (${whisperWords.length} whisper words), paragraph only`);
        blocks.push(rest);
        continue;
      }
      aligned++;
      blocks.push({ ...rest, words });
    }

    const out = { ...timings, version: 2, blocks };
    writeFileSync(jsonPath, JSON.stringify(out));
    r2.put(`${AUDIO_PREFIX}/${slug}.json`, jsonPath, "application/json");
    log(`${slug}: aligned ${aligned}/${blocks.length} blocks`);
    return "aligned";
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  if (!existsSync(PYTHON)) fail('no .venv-tts — see README "Read-aloud audio"');
  if (spawnSync(PYTHON, ["-c", "import mlx_whisper"]).status !== 0) {
    fail(".venv-tts cannot import mlx_whisper — pip install -r scripts/tts/requirements.txt");
  }
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) fail("ffmpeg not on PATH");

  r2.checkLogin();
  const targets = slugs.length ? slugs : publishedSlugs();
  const worker = startWorker();
  let failures: string[];
  try {
    failures = await runEach(targets, slug => alignPost(slug, worker));
  } finally {
    await worker.close();
  }
  if (failures.length) process.exit(1);
}

runMain(main);
