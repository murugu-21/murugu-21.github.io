// Renders each published post to MP3 with per-paragraph timings and uploads
// both to R2. Runs locally:
//
//   bun run build                # the built site (scripts/site/site-dir.ts) must be current
//   bun run audio                # every post whose spoken text changed
//   bun run audio first-post     # one post
//   bun run audio --force        # regenerate even if unchanged
//   bun run audio --local        # target the local R2 that `bun run dev` serves
//   bun run audio --dry-run      # extract + hash only, no synthesis/upload
//   bun run audio --patch react  # re-synthesize only the changed paragraphs
//   bun run audio --upload-voice # push .voice/* to R2 once
//
// Per post:
// 1. speechBlocks, the same extractor the page uses, pulls text from the built HTML.
// 2. packSentences splits it into chunks of at most 300 characters.
// 3. synth.py (Breeze TTS 2 via mlx-audio) renders each chunk, and ffmpeg applies atempo.
// 4. assemble() joins the chunks sample-accurately and loudnorm levels the result.
// 5. The 64 kbps MP3 and its timing JSON go to R2.
//
// --patch keeps the MP3 in R2 and splices in only the blocks whose text
// changed, each loudness-levelled on its own. Run `bun run audio:align
// <slug> --force` afterwards, since the changed blocks lose their words.
import type { Buffer } from "node:buffer";
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

import { spokenHash } from "#src/lib/blog/audio-prep.ts";
import {
  BLOG_DIST,
  PYTHON,
  audioArgs,
  ffmpeg,
  publishedSlugs,
  requireFfmpeg,
  requirePython,
  runEach
} from "./tts/cli.ts";
import { startJsonLines } from "./tts/json-lines.ts";
import { AUDIO_PREFIX } from "#contracts/audio.ts";
import { VOICE_PREFIX, r2Store } from "./tts/r2.ts";
import {
  type Chunk,
  type SynthClient,
  chunkBlock,
  postBlocks,
  sharedSampleRate,
  synthClient
} from "./tts/synth.ts";
import {
  StoredTimings,
  changedBlocks,
  patchedTimings,
  renderedTimings,
  round3,
  storedHash
} from "./tts/timings.ts";
import { assemble, pcmSeconds, readWav, splice, writeWav } from "./tts/wav.ts";
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
const GAPS = { intra: 0.15, inter: 0.45 };
const TEMPO = Number(process.env.AUDIO_TEMPO ?? 1.08);
// Loudness only. Breeze is ~-60 dBFS between words, so no denoise or gate.
const POSTFX = process.env.AUDIO_LOUDNORM === "0" ? null : "loudnorm=I=-16:TP=-1.5:LRA=9";

const options = audioArgs(process.argv.slice(2));
const r2 = r2Store(options.local);
const stored = (slug: string, ext: "mp3" | "json") => r2.get(`${AUDIO_PREFIX}/${slug}.${ext}`);
function upload({ slug, mp3, json }: { slug: string; mp3: string; json: string }) {
  r2.put({ key: `${AUDIO_PREFIX}/${slug}.mp3`, file: mp3, contentType: "audio/mpeg" });
  r2.put({ key: `${AUDIO_PREFIX}/${slug}.json`, file: json, contentType: "application/json" });
}

type Reference = { audio: string; text: string };

function checkPreconditions(): Reference {
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

const extractBlocks = (slug: string) =>
  postBlocks({ slug, html: readFileSync(join(BLOG_DIST, slug, "index.html"), "utf8") });

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

// Renders every chunk and returns them per block, tempo applied.
async function synthesize({
  tmp,
  blockChunks,
  worker,
  reference
}: {
  tmp: string;
  blockChunks: Chunk[][];
  worker: SynthClient;
  reference: Reference;
}) {
  const outDir = join(tmp, "chunks");
  const jobPath = join(tmp, "job.json");
  writeFileSync(jobPath, JSON.stringify({ reference, outDir, chunks: blockChunks.flat() }));
  await worker.runJob(jobPath);
  const rendered = blockChunks.map(block => block.map(({ id }) => tempoChunk({ outDir, id })));
  return { rendered, sampleRate: sharedSampleRate(rendered.flat()) };
}

async function renderPost(slug: string, worker: SynthClient | null, reference: Reference) {
  const blocks = extractBlocks(slug);
  const hash = await spokenHash(blocks);
  if (!options.force && storedHash(stored(slug, "json")?.toString() ?? null) === hash) {
    console.log(`${slug}: unchanged, skipping`);
    return;
  }
  const blockChunks = blocks.map(chunkBlock);
  console.log(
    `${slug}: ${blocks.length} blocks, ${blockChunks.flat().length} chunks, ${blocks.join(" ").length} chars`
  );
  if (!worker) return;

  // Nothing deletes this dir, so you can push a failed upload by hand.
  const tmp = mkdtempSync(join(tmpdir(), `audio-${slug}-`));
  console.log(`${slug}: rendering in ${tmp}`);
  const { rendered, sampleRate } = await synthesize({ tmp, blockChunks, worker, reference });
  const { pcm, timings } = assemble(rendered, sampleRate, GAPS);
  const duration = pcmSeconds(pcm, sampleRate);
  const doc = renderedTimings({
    slug,
    hash,
    voice: VOICE_ID,
    sampleRate,
    duration,
    texts: blocks,
    spans: timings
  });

  // Neither loudnorm nor the encode changes timing.
  const fullWav = join(tmp, `${slug}.wav`);
  const mp3 = join(tmp, `${slug}.mp3`);
  writeFileSync(fullWav, writeWav(sampleRate, pcm));
  ffmpeg(["-i", fullWav, ...(POSTFX ? ["-af", POSTFX] : []), "-b:a", "64k", mp3]);
  const json = join(tmp, `${slug}.json`);
  writeFileSync(json, JSON.stringify(doc));
  upload({ slug, mp3, json });
  console.log(`${slug}: uploaded ${(duration / 60).toFixed(1)} min`);
}

// Mono 16-bit PCM. ffmpeg drops the encoder delay, so the length must match the
// timings; a mismatch would shift every splice point.
function decodeMp3({
  mp3,
  sampleRate,
  duration
}: {
  mp3: string;
  sampleRate: number;
  duration: number;
}) {
  const wav = `${mp3}.wav`;
  ffmpeg(["-i", mp3, "-ac", "1", "-ar", String(sampleRate), "-c:a", "pcm_s16le", wav]);
  const { pcm } = readWav(readFileSync(wav));
  const decoded = pcmSeconds(pcm, sampleRate);
  if (Math.abs(decoded - duration) > 0.01) {
    throw new Error(`${mp3} decodes to ${decoded.toFixed(3)} s, timings say ${duration} s`);
  }
  console.log(`  ${mp3}: decoded ${decoded.toFixed(3)} s, timings say ${duration} s`);
  return pcm;
}

// The full render levels the whole post at once; a patched block is levelled
// on its own so it sits at the same loudness as the rest.
function levelBlock({
  tmp,
  id,
  pcm,
  sampleRate
}: {
  tmp: string;
  id: string;
  pcm: Buffer;
  sampleRate: number;
}) {
  if (!POSTFX) return pcm;
  const src = join(tmp, `${id}.wav`);
  const dst = join(tmp, `${id}.level.wav`);
  writeFileSync(src, writeWav(sampleRate, pcm));
  // loudnorm resamples to 192 kHz internally.
  ffmpeg(["-i", src, "-af", POSTFX, "-ar", String(sampleRate), "-c:a", "pcm_s16le", dst]);
  return readWav(readFileSync(dst)).pcm;
}

async function patchPost(slug: string, worker: SynthClient | null, reference: Reference) {
  const blocks = extractBlocks(slug);
  const storedJson = stored(slug, "json");
  if (!storedJson) {
    console.log(`${slug}: no audio in R2 to patch, skipping; run \`bun run audio ${slug}\``);
    return;
  }
  const timings = StoredTimings.parse(storedJson.toString());
  const changed = changedBlocks({ slug, stored: timings, texts: blocks });
  if (changed.length === 0) {
    console.log(`${slug}: no changed blocks, skipping`);
    return;
  }
  console.log(`${slug}: ${changed.length} changed block(s): ${changed.join(", ")}`);
  for (const i of changed) {
    console.log(`  b${i} old: ${timings.blocks[i].text}\n  b${i} new: ${blocks[i]}`);
  }
  if (!worker) return;

  const storedMp3 = stored(slug, "mp3");
  if (!storedMp3) throw new Error("timings in R2 but no MP3");
  const tmp = mkdtempSync(join(tmpdir(), `audio-${slug}-patch-`));
  const backup = join(tmp, "backup");
  mkdirSync(backup);
  const oldMp3 = join(backup, `${slug}.mp3`);
  writeFileSync(oldMp3, storedMp3);
  writeFileSync(join(backup, `${slug}.json`), storedJson);
  console.log(`${slug}: R2 objects backed up in ${backup}, patching in ${tmp}`);

  const { sampleRate } = timings;
  const oldPcm = decodeMp3({ mp3: oldMp3, sampleRate, duration: timings.duration });
  const synth = await synthesize({
    tmp,
    blockChunks: changed.map(i => chunkBlock(blocks[i], i)),
    worker,
    reference
  });
  if (synth.sampleRate !== sampleRate) {
    throw new Error(`synthesized at ${synth.sampleRate} Hz, stored audio is ${sampleRate} Hz`);
  }
  const replace = new Map(
    changed.map((b, k) => {
      const { pcm } = assemble([synth.rendered[k]], sampleRate, GAPS);
      return [b, levelBlock({ tmp, id: `b${b}`, pcm, sampleRate })];
    })
  );
  const spliced = splice({ pcm: oldPcm, sampleRate, blocks: timings.blocks, replace });

  const wav = join(tmp, `${slug}.wav`);
  const mp3 = join(tmp, `${slug}.mp3`);
  writeFileSync(wav, writeWav(sampleRate, spliced.pcm));
  // No loudnorm here: the untouched audio is already levelled.
  ffmpeg(["-i", wav, "-b:a", "64k", mp3]);
  const duration = round3(pcmSeconds(spliced.pcm, sampleRate));
  decodeMp3({ mp3, sampleRate, duration });

  const json = join(tmp, `${slug}.json`);
  const doc = patchedTimings({
    stored: timings,
    texts: blocks,
    hash: await spokenHash(blocks),
    duration,
    spans: spliced.timings,
    patched: new Set(changed)
  });
  writeFileSync(json, JSON.stringify(doc));
  upload({ slug, mp3, json });
  const delta = duration - timings.duration;
  console.log(
    `${slug}: uploaded, ${timings.duration} s → ${duration} s (${delta >= 0 ? "+" : ""}${delta.toFixed(3)} s)`
  );
}

function uploadVoice() {
  if (!existsSync(VOICE_WAV) || !existsSync(VOICE_TXT)) {
    throw new Error("put reference.wav and reference.txt in .voice/ first");
  }
  r2.put({ key: `${VOICE_PREFIX}/reference.wav`, file: VOICE_WAV, contentType: "audio/wav" });
  r2.put({ key: `${VOICE_PREFIX}/reference.txt`, file: VOICE_TXT, contentType: "text/plain" });
  console.log("voice reference uploaded");
}

async function renderAll() {
  r2.checkLogin();
  const reference = checkPreconditions();
  const targets = options.slugs.length ? options.slugs : publishedSlugs();
  for (const s of targets) {
    if (!existsSync(join(BLOG_DIST, s, "index.html"))) {
      throw new Error(`no built post for slug "${s}"`);
    }
  }

  await using worker = options["dry-run"] ? null : synthClient(startJsonLines(PYTHON, [WORKER]));
  if (worker) {
    const ready = await worker.ready;
    console.log(`model loaded in ${ready.loadSeconds}s`);
  }
  const render = options.patch ? patchPost : renderPost;
  const failures = await runEach(targets, slug => render(slug, worker, reference));
  if (failures.length) process.exitCode = 1;
}

if (options["upload-voice"]) uploadVoice();
else await renderAll();
