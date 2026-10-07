// Renders each published post to MP3 with per-paragraph timings and uploads
// both to R2. Runs locally:
//
//   bun run build                # the built site (scripts/site/site-dir.ts) must be current
//   bun run audio                # every post whose spoken text changed
//   bun run audio first-post     # one post
//   bun run audio --force        # regenerate even if unchanged
//   bun run audio --local        # target the local R2 that `bun run dev` serves
//   bun run audio --dry-run      # extract + hash only, no synthesis/upload
//   bun run audio --upload-voice # push .voice/* to R2 once
//
// Per post:
// 1. speechBlocks, the same extractor the page uses, pulls text from the built HTML.
// 2. packSentences splits it into chunks of at most 300 characters.
// 3. synth.py (Breeze TTS 2 via mlx-audio) renders each chunk, and ffmpeg applies atempo.
// 4. assemble() joins the chunks sample-accurately and loudnorm levels the result.
// 5. The 64 kbps MP3 and its timing JSON go to R2.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseHTML } from "linkedom";
import { z } from "zod";

import { jsonString } from "#utils/json.ts";
import { speechBlocks } from "#src/lib/blog/speech.ts";
import { normalizeSpeechText, packSentences, spokenHash } from "#src/lib/blog/audio-prep.ts";
import {
  BLOG_DIST,
  PYTHON,
  ffmpeg,
  publishedSlugs,
  requireFfmpeg,
  requirePython,
  runEach
} from "./tts/cli.ts";
import { startJsonLines } from "./tts/json-lines.ts";
import { AUDIO_PREFIX } from "#contracts/audio.ts";
import { VOICE_PREFIX, r2Store } from "./tts/r2.ts";
import { assemble, readWav, writeWav } from "./tts/wav.ts";
import { ROOT } from "./site-dir.ts";

// Env overrides are for A/B renders, not production.
//   AUDIO_VOICE_DIR   directory holding reference.wav + reference.txt
//   AUDIO_TEMPO       atempo factor, "1" disables the pass
//   AUDIO_LOUDNORM    "0" disables the loudness pass
const VOICE_DIR = process.env.AUDIO_VOICE_DIR
  ? resolve(process.env.AUDIO_VOICE_DIR)
  : join(ROOT, ".voice");
const VOICE_WAV = join(VOICE_DIR, "reference.wav");
const VOICE_TXT = join(VOICE_DIR, "reference.txt");
const WORKER = join(import.meta.dirname, "tts", "synth.py");
const VOICE_ID = "breeze-tts-2-8bit/chennai-2026-09-09";
const CHUNK_MAX = 300;
const GAPS = { intra: 0.15, inter: 0.45 };
const TEMPO = Number(process.env.AUDIO_TEMPO ?? 1.08);
// Loudness only. Breeze is ~-60 dBFS between words, so no denoise or gate.
const POSTFX = process.env.AUDIO_LOUDNORM === "0" ? null : "loudnorm=I=-16:TP=-1.5:LRA=9";

const { values: options, positionals: slugs } = parseArgs({
  allowPositionals: true,
  options: {
    force: { type: "boolean" },
    local: { type: "boolean" },
    "dry-run": { type: "boolean" },
    "upload-voice": { type: "boolean" }
  }
});
const r2 = r2Store(options.local ?? false);

function checkPreconditions(): { audio: string; text: string } {
  if (!existsSync(BLOG_DIST)) throw new Error(`${BLOG_DIST} missing; run \`bun run build\` first`);
  requireFfmpeg();
  if (!options["dry-run"]) requirePython("mlx_audio");
  if (!existsSync(VOICE_WAV) || !existsSync(VOICE_TXT)) {
    console.log("no .voice/ reference locally, fetching from R2 …");
    const wav = r2.get(`${VOICE_PREFIX}/reference.wav`);
    const txt = wav && r2.get(`${VOICE_PREFIX}/reference.txt`);
    if (!wav || !txt) {
      throw new Error(
        "voice reference missing locally and in R2; restore .voice/reference.{wav,txt}"
      );
    }
    mkdirSync(VOICE_DIR, { recursive: true });
    writeFileSync(VOICE_WAV, wav);
    writeFileSync(VOICE_TXT, txt);
  }
  return { audio: VOICE_WAV, text: readFileSync(VOICE_TXT, "utf8").trim() };
}

function extractBlocks(slug: string): string[] {
  const html = readFileSync(join(BLOG_DIST, slug, "index.html"), "utf8");
  const { document } = parseHTML(html);
  const title = document.querySelector("article.blog-post header h1");
  const body = document.querySelector("section[data-post-body]");
  if (!body) throw new Error(`${slug}: no post body section`);
  const raw = speechBlocks(body).map(b => b.text);
  if (title) raw.unshift(title.textContent ?? "");
  return raw.map(normalizeSpeechText).filter(t => t.length > 0);
}

// synth.py replies: one after model load, one per chunk, `done` per job.
const ReadyMsg = z.object({ loadSeconds: z.number() });
const ChunkMsg = z.union([
  z.object({ id: z.string(), error: z.string() }),
  z.object({ id: z.string(), seconds: z.number(), wall: z.number() })
]);
type ChunkMsg = z.infer<typeof ChunkMsg>;
const JobMsg = z.union([z.object({ done: z.literal(true) }), ChunkMsg]);

interface Chunk {
  id: string;
  text: string;
}

function startWorker() {
  const { next, send, close } = startJsonLines(PYTHON, [WORKER]);
  return {
    ready: next().then(msg => ReadyMsg.parse(msg)),
    async runJob(jobPath: string, onChunk: (msg: ChunkMsg) => void) {
      send(jobPath);
      for (;;) {
        const msg = JobMsg.parse(await next());
        if ("done" in msg) return;
        onChunk(msg);
      }
    },
    [Symbol.asyncDispose]: close
  };
}

type Worker = ReturnType<typeof startWorker>;

const StoredHash = jsonString(z.object({ hash: z.string() }));

function existingHash(slug: string): string | null {
  const stored = r2.get(`${AUDIO_PREFIX}/${slug}.json`);
  if (!stored) return null;
  return StoredHash.safeParse(stored.toString()).data?.hash ?? null;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

// Applies tempo per chunk, so the timings measured afterwards are exact.
function tempoChunk({ outDir, id }: { outDir: string; id: string }) {
  const src = join(outDir, `${id}.wav`);
  const dst = join(outDir, `${id}.tempo.wav`);
  if (!existsSync(src)) throw new Error(`missing chunk ${id}`);
  if (TEMPO === 1) copyFileSync(src, dst);
  else ffmpeg(["-i", src, "-af", `atempo=${TEMPO}`, "-c:a", "pcm_s16le", dst]);
  const wav = readWav(readFileSync(dst));
  if (wav.pcm.length === 0) throw new Error(`empty chunk ${id}`);
  return { id, ...wav };
}

async function renderPost(
  slug: string,
  worker: Worker | null,
  reference: { audio: string; text: string }
) {
  const blocks = extractBlocks(slug);
  const hash = await spokenHash(blocks);
  if (!options.force && existingHash(slug) === hash) {
    console.log(`${slug}: unchanged, skipping`);
    return;
  }
  const blockChunks: Chunk[][] = blocks.map((text, b) =>
    packSentences(text, CHUNK_MAX).map((chunkText, c) => ({
      id: `b${String(b).padStart(3, "0")}-c${String(c).padStart(2, "0")}`,
      text: chunkText
    }))
  );
  const chunks = blockChunks.flat();
  console.log(
    `${slug}: ${blocks.length} blocks, ${chunks.length} chunks, ${blocks.join(" ").length} chars`
  );
  if (!worker) return;

  // Nothing deletes this dir, so you can push a failed upload by hand.
  const tmp = mkdtempSync(join(tmpdir(), `audio-${slug}-`));
  console.log(`${slug}: rendering in ${tmp}`);
  const outDir = join(tmp, "chunks");
  const jobPath = join(tmp, "job.json");
  writeFileSync(jobPath, JSON.stringify({ reference, outDir, chunks }));
  const errors: string[] = [];
  await worker.runJob(jobPath, msg => {
    if ("error" in msg) errors.push(`${msg.id}: ${msg.error}`);
    else console.log(`  ${msg.id} ${msg.seconds.toFixed(1)}s audio in ${msg.wall}s`);
  });
  if (errors.length) {
    throw new Error(`synthesis failed for ${errors.length} chunk(s):\n${errors.join("\n")}`);
  }

  const rendered = blockChunks.map(block => block.map(({ id }) => tempoChunk({ outDir, id })));
  const [first, ...others] = rendered.flat();
  if (!first) throw new Error("no chunks rendered");
  const { sampleRate } = first;
  const mismatch = others.find(chunk => chunk.sampleRate !== sampleRate);
  if (mismatch) throw new Error(`sample rate mismatch in ${mismatch.id}`);
  const { pcm, timings } = assemble(rendered, sampleRate, GAPS);
  if (timings.length !== blocks.length) {
    throw new Error("block/timing count mismatch");
  }

  // Neither loudnorm nor the encode changes timing.
  const fullWav = join(tmp, `${slug}.wav`);
  const mp3 = join(tmp, `${slug}.mp3`);
  writeFileSync(fullWav, writeWav(sampleRate, pcm));
  ffmpeg(["-i", fullWav, ...(POSTFX ? ["-af", POSTFX] : []), "-b:a", "64k", mp3]);

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
  r2.put(`${AUDIO_PREFIX}/${slug}.mp3`, mp3, "audio/mpeg");
  r2.put(`${AUDIO_PREFIX}/${slug}.json`, json, "application/json");
  console.log(`${slug}: uploaded ${(duration / 60).toFixed(1)} min`);
}

function uploadVoice() {
  if (!existsSync(VOICE_WAV) || !existsSync(VOICE_TXT)) {
    throw new Error("put reference.wav and reference.txt in .voice/ first");
  }
  r2.put(`${VOICE_PREFIX}/reference.wav`, VOICE_WAV, "audio/wav");
  r2.put(`${VOICE_PREFIX}/reference.txt`, VOICE_TXT, "text/plain");
  console.log("voice reference uploaded");
}

async function renderAll() {
  r2.checkLogin();
  const reference = checkPreconditions();
  const targets = slugs.length ? slugs : publishedSlugs();
  for (const s of targets) {
    if (!existsSync(join(BLOG_DIST, s, "index.html"))) {
      throw new Error(`no built post for slug "${s}"`);
    }
  }

  await using worker = options["dry-run"] ? null : startWorker();
  if (worker) {
    const ready = await worker.ready;
    console.log(`model loaded in ${ready.loadSeconds}s`);
  }
  const failures = await runEach(targets, slug => renderPost(slug, worker, reference));
  if (failures.length) process.exitCode = 1;
}

if (options["upload-voice"]) uploadVoice();
else await renderAll();
