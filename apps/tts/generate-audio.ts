import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { exists } from "@murugappan/utils/node/fs.ts";

import {
  BLOG_DIST,
  PYTHON,
  audioArgs,
  ffmpeg,
  publishedSlugs,
  requireFfmpeg,
  requirePython,
  runEach
} from "./cli.ts";
import { alignPost, whisperClient } from "./align.ts";
import { startJsonLines } from "./json-lines.ts";
import { VOICE_PREFIX, r2Store } from "./r2.ts";
import { type Reference, type RenderDeps, type Synth, patchPost, renderPost } from "./render.ts";
import { synthClient } from "./synth.ts";

const VOICE_DIR = process.env.AUDIO_VOICE_DIR
  ? resolve(process.env.AUDIO_VOICE_DIR)
  : join(import.meta.dirname, ".voice");
const VOICE_WAV = join(VOICE_DIR, "reference.wav");
const VOICE_TXT = join(VOICE_DIR, "reference.txt");
const SYNTH_WORKER = join(import.meta.dirname, "synth.py");
const WHISPER_WORKER = join(import.meta.dirname, "whisper.py");
const TEMPO = Number(process.env.AUDIO_TEMPO ?? 1.08);
const POSTFX = process.env.AUDIO_LOUDNORM === "0" ? null : "loudnorm=I=-16:TP=-1.5:LRA=9";

const options = audioArgs();
const r2 = r2Store(options.local ? "local" : "remote");
const deps: RenderDeps = {
  r2,
  ffmpeg,
  blogDist: BLOG_DIST,
  tmpRoot: tmpdir(),
  settings: { tempo: TEMPO, postfx: POSTFX }
};

const hasVoice = async () => (await exists(VOICE_WAV)) && (await exists(VOICE_TXT));

async function checkPreconditions(): Promise<Reference> {
  if (!(await exists(BLOG_DIST))) {
    throw new Error(`${BLOG_DIST} missing; run \`bun run build\` first`);
  }
  await requireFfmpeg();
  if (!options["dry-run"]) {
    await requirePython("mlx_audio");
    await requirePython("mlx_whisper");
  }
  if (!(await hasVoice())) {
    console.log("no .voice/ reference locally, fetching from R2 …");
    const wav = await r2.get(`${VOICE_PREFIX}/reference.wav`);
    const txt = wav && (await r2.get(`${VOICE_PREFIX}/reference.txt`));
    if (!wav || !txt) {
      throw new Error(
        "voice reference missing locally and in R2; restore .voice/reference.{wav,txt}"
      );
    }
    await mkdir(VOICE_DIR, { recursive: true });
    await writeFile(VOICE_WAV, wav);
    await writeFile(VOICE_TXT, txt);
  }
  return { audio: VOICE_WAV, text: (await readFile(VOICE_TXT, "utf8")).trim() };
}

async function uploadVoice() {
  if (!(await hasVoice())) throw new Error("put reference.wav and reference.txt in .voice/ first");
  await r2.put({ key: `${VOICE_PREFIX}/reference.wav`, file: VOICE_WAV, contentType: "audio/wav" });
  await r2.put({
    key: `${VOICE_PREFIX}/reference.txt`,
    file: VOICE_TXT,
    contentType: "text/plain"
  });
  console.log("voice reference uploaded");
}

async function synthesizeAll({ reference, targets }: { reference: Reference; targets: string[] }) {
  await using worker = options["dry-run"]
    ? null
    : synthClient(startJsonLines(PYTHON, [SYNTH_WORKER]));
  let synth: Synth | null = null;
  if (worker) {
    const ready = await worker.ready;
    console.log(`model loaded in ${ready.loadSeconds}s`);
    synth = { worker, reference, sampleRate: ready.sampleRate };
  }
  return await runEach(targets, slug =>
    options.patch
      ? patchPost(deps, { slug, synth })
      : renderPost(deps, { slug, synth, force: options.force })
  );
}

async function alignAll(targets: string[]) {
  await using whisper = options["dry-run"]
    ? null
    : whisperClient(startJsonLines(PYTHON, [WHISPER_WORKER]));
  return await runEach(targets, slug =>
    alignPost({ r2, ffmpeg }, { slug, whisper, force: options.force || options.patch })
  );
}

async function renderAll() {
  await r2.checkLogin();
  const reference = await checkPreconditions();
  const targets = options.slugs.length ? options.slugs : await publishedSlugs(BLOG_DIST);
  for (const s of targets) {
    if (!(await exists(join(BLOG_DIST, s, "index.html")))) {
      throw new Error(`no built post for slug "${s}"`);
    }
  }

  const renderFailures = await synthesizeAll({ reference, targets });
  const alignFailures = await alignAll(targets);
  if (renderFailures.length || alignFailures.length) process.exitCode = 1;
}

if (options["upload-voice"]) await uploadVoice();
else await renderAll();
