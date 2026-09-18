// Adds word-level timings to the read-aloud JSON already in R2, so the page
// can highlight the word being spoken. Runs on the author's laptop after
// `bun run audio`; never re-synthesises anything:
//
//   bun run audio:align              # every post whose JSON is still version 1
//   bun run audio:align first-post   # one post
//   bun run audio:align --force   # re-align version 2 posts too
//   bun run audio:align --local   # target `wrangler dev`'s local R2
//
// Per post: fetch <slug>.json + .mp3 → decode to 16 kHz mono → slice each
// block by its timings → mlx-whisper word timestamps (scripts/tts/whisper.py,
// long-lived worker) → alignWords() maps them onto the block's known text →
// write version 2 JSON back. Blocks that align poorly keep no `words` and
// fall back to the paragraph highlight. Do not run while `bun run audio` is
// synthesising: both want the GPU.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { alignWords, type TimedWord, type WhisperWord } from "../src/blog/utils/audio-words.ts";
import { fail, log, publishedSlugs, run, runEach } from "./tts/cli.ts";
import { startJsonLines } from "./tts/json-lines.ts";
import { r2Store } from "./tts/r2.ts";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DIST = join(ROOT, "dist", "blog");
const PYTHON = join(ROOT, ".venv-tts", "bin", "python");
const WORKER = join(ROOT, "scripts", "tts", "whisper.py");

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith("--")));
const slugs = args.filter(a => !a.startsWith("--"));
const local = flags.has("--local");

const r2 = r2Store(local);

// ---- whisper worker ---------------------------------------------------------

// One JSON line back from scripts/tts/whisper.py per transcribe() job.
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

// The timing JSON written by generate-audio.ts (version 1) and rewritten here
// with per-word times (version 2); mirrors src/blog/utils/audio-sync.ts.
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

// ---- per-post -----------------------------------------------------------------

async function alignPost(slug: string, worker: Worker) {
  const tmp = mkdtempSync(join(tmpdir(), `align-${slug}-`));
  try {
    const jsonPath = join(tmp, "timings.json");
    const mp3 = join(tmp, "post.mp3");
    if (!r2.get(`blog/breeze/${slug}.json`, jsonPath)) {
      log(`${slug}: no audio in R2, skipping`);
      return "skipped";
    }
    const timings = JSON.parse(readFileSync(jsonPath, "utf8")) as Timings;
    if (timings.version >= 2 && !flags.has("--force")) {
      log(`${slug}: already aligned, skipping`);
      return "skipped";
    }
    if (!r2.get(`blog/breeze/${slug}.mp3`, mp3)) throw new Error("mp3 missing in R2");

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
      if (words) {
        aligned++;
        blocks.push({ ...rest, words });
      } else {
        log(`  b${i}: poor match (${whisperWords.length} whisper words), paragraph only`);
        blocks.push(rest);
      }
    }

    const out = { ...timings, version: 2, blocks };
    writeFileSync(jsonPath, JSON.stringify(out));
    r2.put(`blog/breeze/${slug}.json`, jsonPath, "application/json");
    log(`${slug}: aligned ${aligned}/${blocks.length} blocks`);
    return "aligned";
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- main ------------------------------------------------------------------------

async function main() {
  if (!existsSync(PYTHON)) fail('no .venv-tts — see README "Read-aloud audio"');
  if (spawnSync(PYTHON, ["-c", "import mlx_whisper"]).status !== 0) {
    fail(".venv-tts cannot import mlx_whisper — pip install -r scripts/tts/requirements.txt");
  }
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) fail("ffmpeg not on PATH");

  r2.checkLogin();
  const targets = slugs.length ? slugs : publishedSlugs(DIST);
  const worker = startWorker();
  let failures: string[];
  try {
    failures = await runEach(targets, slug => alignPost(slug, worker));
  } finally {
    await worker.close();
  }
  if (failures.length) process.exit(1);
}

main().catch((err: unknown) =>
  fail(err instanceof Error ? (err.stack ?? err.message) : String(err))
);
