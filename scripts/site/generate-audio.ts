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
// Per post (tts/render.ts):
// 1. speechBlocks, the same extractor the page uses, pulls text from the built HTML.
// 2. packSentences splits it into chunks of at most 300 characters.
// 3. synth.py (Breeze TTS 2 via mlx-audio) renders each chunk, and ffmpeg applies atempo.
// 4. assemble() joins the chunks sample-accurately and loudnorm levels the result.
// 5. The 64 kbps MP3 and its timing JSON go to R2.
//
// --patch keeps the MP3 in R2 and splices in only the blocks whose text
// changed, each loudness-levelled on its own. Run `bun run audio:align
// <slug> --force` afterwards, since the changed blocks lose their words.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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
import { VOICE_PREFIX, r2Store } from "./tts/r2.ts";
import {
  type Reference,
  type RenderDeps,
  type Synth,
  patchPost,
  renderPost
} from "./tts/render.ts";
import { synthClient } from "./tts/synth.ts";
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
const TEMPO = Number(process.env.AUDIO_TEMPO ?? 1.08);
// Loudness only. Breeze is ~-60 dBFS between words, so no denoise or gate.
const POSTFX = process.env.AUDIO_LOUDNORM === "0" ? null : "loudnorm=I=-16:TP=-1.5:LRA=9";

const options = audioArgs(process.argv.slice(2));
const r2 = r2Store(options.local ? "local" : "remote");
const deps: RenderDeps = {
  r2,
  ffmpeg,
  blogDist: BLOG_DIST,
  tmpRoot: tmpdir(),
  settings: { tempo: TEMPO, postfx: POSTFX }
};

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
  const targets = options.slugs.length ? options.slugs : publishedSlugs(BLOG_DIST);
  for (const s of targets) {
    if (!existsSync(join(BLOG_DIST, s, "index.html"))) {
      throw new Error(`no built post for slug "${s}"`);
    }
  }

  await using worker = options["dry-run"] ? null : synthClient(startJsonLines(PYTHON, [WORKER]));
  // Null on a dry run.
  let synth: Synth | null = null;
  if (worker) {
    const ready = await worker.ready;
    console.log(`model loaded in ${ready.loadSeconds}s`);
    synth = { worker, reference, sampleRate: ready.sampleRate };
  }
  const failures = await runEach(targets, slug =>
    options.patch
      ? patchPost(deps, { slug, synth })
      : renderPost(deps, { slug, synth, force: options.force })
  );
  if (failures.length) process.exitCode = 1;
}

if (options["upload-voice"]) uploadVoice();
else await renderAll();
