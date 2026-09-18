// Renders each published blog post to MP3 in the blog's designed voice and
// uploads it, with per-paragraph timings, to R2. Runs on the author's laptop:
//
//   bun run build                # dist/ must be current
//   bun run audio                # every post whose spoken text changed
//   bun run audio first-post     # one post
//   bun run audio --force     # regenerate even if unchanged
//   bun run audio --local     # target `wrangler dev`'s local R2
//   bun run audio --dry-run   # extract + hash only, no synthesis/upload
//   bun run audio --keep      # leave the temp dir behind for inspection
//   bun run audio --upload-voice   # push .voice/* to R2 once
//
// Pipeline per post: dist HTML → speechBlocks (same function the page uses) →
// normalise → pack into ≤300-char sentence groups → Python worker (Breeze TTS 2
// 8-bit via mlx-audio, plain clone of .voice/reference.wav) → per-chunk
// atempo=1.08 → sample-accurate assembly with gaps → loudnorm → 64 kbps MP3 +
// timing JSON → wrangler r2 object put under blog/breeze/.
import { spawnSync } from "node:child_process";
import type { Buffer } from "node:buffer";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseHTML } from "linkedom";

import { speechBlocks } from "../src/blog/utils/speech.ts";
import { normalizeSpeechText, packSentences, spokenHash } from "../src/blog/utils/audio-prep.ts";
import { fail, log, publishedSlugs, run, runEach } from "./tts/cli.ts";
import { startJsonLines } from "./tts/json-lines.ts";
import { r2Store } from "./tts/r2.ts";
import { assemble, readWav, writeWav } from "./tts/wav.ts";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DIST = join(ROOT, "dist", "blog");
// Tuning knobs. The defaults are the settings the 2026-09-09 evaluation
// settled on; the env overrides exist for A/B renders, not for production.
//   AUDIO_VOICE_DIR   directory holding reference.wav + reference.txt
//   AUDIO_TEMPO       atempo factor, "1" disables the pass
//   AUDIO_LOUDNORM    "0" disables the loudness pass
const VOICE_DIR = process.env.AUDIO_VOICE_DIR
  ? resolve(process.env.AUDIO_VOICE_DIR)
  : join(ROOT, ".voice");
const PYTHON = join(ROOT, ".venv-tts", "bin", "python");
const WORKER = join(ROOT, "scripts", "tts", "synth.py");
// Object keys are namespaced per voice generation so a new voice never
// overwrites the previous one; worker/audio.ts and align-audio.ts read the
// same prefix. The Fish clone of 2026-09-05 lives at blog/<slug>.*.
const KEY_PREFIX = "blog/breeze";
const VOICE_KEY_PREFIX = "voice/breeze";
const VOICE_ID = "breeze-tts-2-8bit/chennai-2026-09-09";
const CHUNK_MAX = 300;
const GAPS = { intra: 0.15, inter: 0.45 };
const TEMPO = Number(process.env.AUDIO_TEMPO ?? 1.08);
// Whole-post chain, applied after assembly and before the MP3 encode: podcast
// loudness only. Breeze output sits at about -60 dBFS between words, so the
// denoise and gate the Fish clone needed are gone (measured 2026-09-09).
const POSTFX = process.env.AUDIO_LOUDNORM === "0" ? null : "loudnorm=I=-16:TP=-1.5:LRA=9";

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith("--")));
const slugs = args.filter(a => !a.startsWith("--"));
const local = flags.has("--local");

const r2 = r2Store(local);

// ---- preconditions ---------------------------------------------------------

function checkPreconditions(): { audio: string; text: string } {
  if (!existsSync(DIST)) fail("dist/blog missing — run `bun run build` first");
  for (const tool of ["ffmpeg", "ffprobe"]) {
    if (spawnSync(tool, ["-version"]).status !== 0) {
      fail(`${tool} not on PATH (brew install ffmpeg)`);
    }
  }
  if (!flags.has("--dry-run")) {
    if (!existsSync(PYTHON)) {
      fail(
        "no .venv-tts — run: python3.13 -m venv .venv-tts && .venv-tts/bin/pip install -r scripts/tts/requirements.txt"
      );
    }
    if (spawnSync(PYTHON, ["-c", "import mlx_audio"]).status !== 0) {
      fail(".venv-tts cannot import mlx_audio — reinstall scripts/tts/requirements.txt");
    }
  }
  const wav = join(VOICE_DIR, "reference.wav");
  const txt = join(VOICE_DIR, "reference.txt");
  if (!existsSync(wav) || !existsSync(txt)) {
    log("no .voice/ reference locally, fetching from R2 …");
    mkdirSync(VOICE_DIR, { recursive: true });
    if (
      !r2.get(`${VOICE_KEY_PREFIX}/reference.wav`, wav) ||
      !r2.get(`${VOICE_KEY_PREFIX}/reference.txt`, txt)
    ) {
      fail("voice reference missing locally and in R2 — restore .voice/reference.{wav,txt}");
    }
  }
  return { audio: wav, text: readFileSync(txt, "utf8").trim() };
}

// ---- extraction ------------------------------------------------------------

function extractBlocks(slug: string): string[] {
  const html = readFileSync(join(DIST, slug, "index.html"), "utf8");
  const { document } = parseHTML(html);
  const title = document.querySelector("article.blog-post header h1");
  const body = document.querySelector("section[itemprop='articleBody']");
  if (!body) throw new Error(`${slug}: no articleBody section`);
  const raw = speechBlocks(body).map(b => b.text);
  if (title) raw.unshift(title.textContent ?? "");
  return raw.map(normalizeSpeechText).filter(t => t.length > 0);
}

// ---- synthesis worker -------------------------------------------------------

// JSON lines from scripts/tts/synth.py: one after the model loads, one per
// finished chunk, and a `done` marker at the end of each job.
interface ReadyMsg {
  loadSeconds: number;
}
type ChunkMsg = { id: string; error: string } | { id: string; seconds: number; wall: number };
type JobMsg = { done: true } | ({ done?: false } & ChunkMsg);

interface Chunk {
  id: string;
  text: string;
}

function startWorker() {
  const { next, send, close } = startJsonLines(PYTHON, [WORKER]);
  return {
    ready: next() as Promise<ReadyMsg>,
    async runJob(jobPath: string, onChunk: (msg: ChunkMsg) => void) {
      send(jobPath);
      for (;;) {
        const msg = (await next()) as JobMsg;
        if (msg.done) return;
        onChunk(msg);
      }
    },
    close
  };
}

type Worker = ReturnType<typeof startWorker>;

// ---- per-post pipeline ------------------------------------------------------

function existingHash(slug: string, tmp: string): string | null {
  const file = join(tmp, "existing.json");
  if (!r2.get(`${KEY_PREFIX}/${slug}.json`, file)) return null;
  try {
    const { hash } = JSON.parse(readFileSync(file, "utf8")) as { hash?: string };
    return hash ?? null;
  } catch {
    return null;
  }
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

async function renderPost(
  slug: string,
  worker: Worker | null,
  reference: { audio: string; text: string }
) {
  const blocks = extractBlocks(slug);
  const hash = await spokenHash(blocks);
  const tmp = mkdtempSync(join(tmpdir(), `audio-${slug}-`));
  try {
    if (!flags.has("--force") && existingHash(slug, tmp) === hash) {
      log(`${slug}: unchanged, skipping`);
      return "skipped";
    }
    const chunks: Chunk[] = [];
    const chunkIds = blocks.map((text, b) =>
      packSentences(text, CHUNK_MAX).map((chunkText, c) => {
        const id = `b${String(b).padStart(3, "0")}-c${String(c).padStart(2, "0")}`;
        chunks.push({ id, text: chunkText });
        return id;
      })
    );
    log(
      `${slug}: ${blocks.length} blocks, ${chunks.length} chunks, ${blocks.join(" ").length} chars`
    );
    if (flags.has("--dry-run") || !worker) return "dry-run";

    const outDir = join(tmp, "chunks");
    const jobPath = join(tmp, "job.json");
    writeFileSync(jobPath, JSON.stringify({ reference, outDir, chunks }));
    const errors: string[] = [];
    await worker.runJob(jobPath, msg => {
      if ("error" in msg) errors.push(`${msg.id}: ${msg.error}`);
      else log(`  ${msg.id} ${msg.seconds.toFixed(1)}s audio in ${msg.wall}s`);
    });
    if (errors.length) {
      throw new Error(`synthesis failed for ${errors.length} chunk(s):\n${errors.join("\n")}`);
    }

    // Post-fx pass 1: tempo per chunk, so timings measured afterwards are exact.
    let sampleRate: number | undefined;
    const perBlock: { pcm: Buffer }[][] = chunkIds.map(ids =>
      ids.map(id => {
        const src = join(outDir, `${id}.wav`);
        const dst = join(outDir, `${id}.tempo.wav`);
        if (!existsSync(src)) throw new Error(`missing chunk ${id}`);
        if (TEMPO === 1) {
          copyFileSync(src, dst);
        } else {
          run("ffmpeg", [
            "-y",
            "-loglevel",
            "error",
            "-i",
            src,
            "-af",
            `atempo=${TEMPO}`,
            "-c:a",
            "pcm_s16le",
            dst
          ]);
        }
        const wav = readWav(readFileSync(dst));
        if (wav.pcm.length === 0) throw new Error(`empty chunk ${id}`);
        sampleRate ??= wav.sampleRate;
        if (wav.sampleRate !== sampleRate) {
          throw new Error(`sample rate mismatch in ${id}`);
        }
        return { pcm: wav.pcm };
      })
    );
    if (sampleRate === undefined) throw new Error("no chunks rendered");
    const { pcm, timings } = assemble(perBlock, sampleRate, GAPS);
    if (timings.length !== blocks.length) {
      throw new Error("block/timing count mismatch");
    }

    // Post-fx pass 2: loudness-normalise the whole post, then encode MP3.
    // Neither changes timing.
    const fullWav = join(tmp, `${slug}.wav`);
    const mp3 = join(tmp, `${slug}.mp3`);
    writeFileSync(fullWav, writeWav(sampleRate, pcm));
    run("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-i",
      fullWav,
      ...(POSTFX ? ["-af", POSTFX] : []),
      "-b:a",
      "64k",
      mp3
    ]);

    const json = join(tmp, `${slug}.json`);
    const duration = pcm.length / 2 / sampleRate;
    writeFileSync(
      json,
      JSON.stringify({
        version: 1,
        slug,
        hash,
        voice: VOICE_ID,
        sampleRate,
        duration: round3(duration),
        blocks: blocks.map((text, i) => ({
          text,
          start: round3(timings[i].start),
          end: round3(timings[i].end)
        }))
      })
    );
    r2.put(`${KEY_PREFIX}/${slug}.mp3`, mp3, "audio/mpeg");
    r2.put(`${KEY_PREFIX}/${slug}.json`, json, "application/json");
    log(`${slug}: uploaded ${(duration / 60).toFixed(1)} min`);
    return "rendered";
  } finally {
    if (flags.has("--keep")) log(`${slug}: kept ${tmp}`);
    else rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- main ------------------------------------------------------------------

async function main() {
  if (flags.has("--upload-voice")) {
    const wav = join(VOICE_DIR, "reference.wav");
    const txt = join(VOICE_DIR, "reference.txt");
    if (!existsSync(wav) || !existsSync(txt)) {
      fail("put reference.wav and reference.txt in .voice/ first");
    }
    r2.put(`${VOICE_KEY_PREFIX}/reference.wav`, wav, "audio/wav");
    r2.put(`${VOICE_KEY_PREFIX}/reference.txt`, txt, "text/plain");
    log("voice reference uploaded");
    return;
  }
  r2.checkLogin();
  const reference = checkPreconditions();
  const targets = slugs.length ? slugs : publishedSlugs(DIST);
  for (const s of targets) {
    if (!existsSync(join(DIST, s, "index.html"))) {
      fail(`no built post for slug "${s}"`);
    }
  }

  const worker = flags.has("--dry-run") ? null : startWorker();
  if (worker) {
    const ready = await worker.ready;
    log(`model loaded in ${ready.loadSeconds}s`);
  }
  let failures: string[];
  try {
    failures = await runEach(targets, slug => renderPost(slug, worker, reference));
  } finally {
    if (worker) await worker.close();
  }
  if (failures.length) process.exit(1);
}

main().catch((err: unknown) =>
  fail(err instanceof Error ? (err.stack ?? err.message) : String(err))
);
