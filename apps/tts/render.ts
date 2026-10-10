// One post's read-aloud audio for generate-audio.ts: a full render, or a patch
// that splices re-synthesized blocks into the MP3 already in R2.
import type { Buffer } from "node:buffer";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { spokenHash } from "./audio-prep.ts";
import type { Ffmpeg } from "./cli.ts";
import { assemble, pcmFormat, pcmSeconds, splice } from "./pcm.ts";
import { type R2Store, audioKey } from "./r2.ts";
import { type Chunk, type SynthClient, chunkBlock, postBlocks } from "./synth.ts";
import {
  StoredTimings,
  changedBlocks,
  patchedTimings,
  renderedTimings,
  round3,
  storedHash
} from "./timings.ts";

const VOICE_ID = "breeze-tts-2-8bit/chennai-2026-09-09";
const GAPS = { intra: 0.15, inter: 0.45 };

export interface RenderDeps {
  r2: Pick<R2Store, "get" | "put">;
  ffmpeg: Ffmpeg;
  blogDist: string;
  tmpRoot: string;
  // `tempo` 1 skips the atempo pass, `postfx` null the loudness pass.
  settings: { tempo: number; postfx: string | null };
}

export interface Reference {
  audio: string;
  text: string;
}

// Null in place of a Synth means a dry run.
export interface Synth {
  worker: Pick<SynthClient, "runJob">;
  reference: Reference;
  sampleRate: number;
}

function upload(
  r2: RenderDeps["r2"],
  { slug, mp3, json }: { slug: string; mp3: string; json: string }
) {
  r2.put({ key: audioKey(slug, "mp3"), file: mp3, contentType: "audio/mpeg" });
  r2.put({ key: audioKey(slug, "json"), file: json, contentType: "application/json" });
}

const extractBlocks = ({ blogDist }: RenderDeps, slug: string) =>
  postBlocks({ slug, html: readFileSync(join(blogDist, slug, "index.html"), "utf8") });

// Applies tempo per chunk, so the timings measured afterwards are exact.
function tempoChunk(
  { ffmpeg, settings }: RenderDeps,
  { outDir, id, sampleRate }: { outDir: string; id: string; sampleRate: number }
) {
  const src = join(outDir, `${id}.wav`);
  const dst = join(outDir, `${id}.tempo.pcm`);
  if (!existsSync(src)) throw new Error(`missing chunk ${id}`);
  const tempo = settings.tempo === 1 ? [] : ["-af", `atempo=${settings.tempo}`];
  ffmpeg(["-i", src, ...tempo, ...pcmFormat(sampleRate), dst]);
  const pcm = readFileSync(dst);
  if (pcm.length === 0) throw new Error(`empty chunk ${id}`);
  return pcm;
}

async function synthesize(
  deps: RenderDeps,
  {
    tmp,
    blockChunks,
    synth: { worker, reference, sampleRate }
  }: { tmp: string; blockChunks: Chunk[][]; synth: Synth }
) {
  const outDir = join(tmp, "chunks");
  const jobPath = join(tmp, "job.json");
  writeFileSync(jobPath, JSON.stringify({ reference, outDir, chunks: blockChunks.flat() }));
  await worker.runJob(jobPath);
  return blockChunks.map(block =>
    block.map(({ id }) => tempoChunk(deps, { outDir, id, sampleRate }))
  );
}

export async function renderPost(
  deps: RenderDeps,
  { slug, synth, force }: { slug: string; synth: Synth | null; force: boolean }
) {
  const { r2, ffmpeg, tmpRoot, settings } = deps;
  const blocks = extractBlocks(deps, slug);
  const hash = spokenHash(blocks);
  const storedJson = force ? null : r2.get(audioKey(slug, "json"));
  if (storedJson && storedHash(storedJson.toString()) === hash) {
    console.log(`${slug}: unchanged, skipping`);
    return;
  }
  const blockChunks = blocks.map(chunkBlock);
  console.log(
    `${slug}: ${blocks.length} blocks, ${blockChunks.flat().length} chunks, ${blocks.join(" ").length} chars`
  );
  if (!synth) return;

  // Nothing deletes this dir, so you can push a failed upload by hand.
  const tmp = mkdtempSync(join(tmpRoot, `audio-${slug}-`));
  console.log(`${slug}: rendering in ${tmp}`);
  const { sampleRate } = synth;
  const rendered = await synthesize(deps, { tmp, blockChunks, synth });
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
  const full = join(tmp, `${slug}.pcm`);
  const mp3 = join(tmp, `${slug}.mp3`);
  writeFileSync(full, pcm);
  const loudness = settings.postfx ? ["-af", settings.postfx] : [];
  ffmpeg([...pcmFormat(sampleRate), "-i", full, ...loudness, "-b:a", "64k", mp3]);
  const json = join(tmp, `${slug}.json`);
  writeFileSync(json, JSON.stringify(doc));
  upload(r2, { slug, mp3, json });
  console.log(`${slug}: uploaded ${(duration / 60).toFixed(1)} min`);
}

// Mono 16-bit PCM. ffmpeg drops the encoder delay, so the length must match the
// timings; a mismatch would shift every splice point.
function decodeMp3(
  ffmpeg: Ffmpeg,
  { mp3, sampleRate, duration }: { mp3: string; sampleRate: number; duration: number }
) {
  const raw = `${mp3}.pcm`;
  ffmpeg(["-i", mp3, ...pcmFormat(sampleRate), raw]);
  const pcm = readFileSync(raw);
  const decoded = pcmSeconds(pcm, sampleRate);
  if (Math.abs(decoded - duration) > 0.01) {
    throw new Error(`${mp3} decodes to ${decoded.toFixed(3)} s, timings say ${duration} s`);
  }
  console.log(`  ${mp3}: decoded ${decoded.toFixed(3)} s, timings say ${duration} s`);
  return pcm;
}

// The full render levels the whole post at once; a patched block is levelled
// on its own so it sits at the same loudness as the rest.
function levelBlock(
  { ffmpeg, settings: { postfx } }: RenderDeps,
  { tmp, id, pcm, sampleRate }: { tmp: string; id: string; pcm: Buffer; sampleRate: number }
) {
  if (!postfx) return pcm;
  const src = join(tmp, `${id}.pcm`);
  const dst = join(tmp, `${id}.level.pcm`);
  writeFileSync(src, pcm);
  // loudnorm resamples to 192 kHz internally; the output's -ar brings it back.
  ffmpeg([...pcmFormat(sampleRate), "-i", src, "-af", postfx, ...pcmFormat(sampleRate), dst]);
  return readFileSync(dst);
}

// Re-synthesizes only the blocks whose text changed and splices them into the
// stored MP3. The patched blocks lose their words until the next align.
export async function patchPost(
  deps: RenderDeps,
  { slug, synth }: { slug: string; synth: Synth | null }
) {
  const { r2, ffmpeg, tmpRoot } = deps;
  const blocks = extractBlocks(deps, slug);
  const storedJson = r2.get(audioKey(slug, "json"));
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
  if (!synth) return;

  const { sampleRate } = timings;
  if (synth.sampleRate !== sampleRate) {
    throw new Error(`synth.py writes ${synth.sampleRate} Hz, stored audio is ${sampleRate} Hz`);
  }
  const storedMp3 = r2.get(audioKey(slug, "mp3"));
  if (!storedMp3) throw new Error("timings in R2 but no MP3");
  const tmp = mkdtempSync(join(tmpRoot, `audio-${slug}-patch-`));
  const backup = join(tmp, "backup");
  mkdirSync(backup);
  const oldMp3 = join(backup, `${slug}.mp3`);
  writeFileSync(oldMp3, storedMp3);
  writeFileSync(join(backup, `${slug}.json`), storedJson);
  console.log(`${slug}: R2 objects backed up in ${backup}, patching in ${tmp}`);

  const oldPcm = decodeMp3(ffmpeg, { mp3: oldMp3, sampleRate, duration: timings.duration });
  const rendered = await synthesize(deps, {
    tmp,
    blockChunks: changed.map(i => chunkBlock(blocks[i], i)),
    synth
  });
  const replace = new Map(
    changed.map((b, k) => {
      const { pcm } = assemble([rendered[k]], sampleRate, GAPS);
      return [b, levelBlock(deps, { tmp, id: `b${b}`, pcm, sampleRate })];
    })
  );
  const spliced = splice({ pcm: oldPcm, sampleRate, blocks: timings.blocks, replace });

  const full = join(tmp, `${slug}.pcm`);
  const mp3 = join(tmp, `${slug}.mp3`);
  writeFileSync(full, spliced.pcm);
  // No loudnorm here: the untouched audio is already levelled.
  ffmpeg([...pcmFormat(sampleRate), "-i", full, "-b:a", "64k", mp3]);
  const duration = round3(pcmSeconds(spliced.pcm, sampleRate));
  decodeMp3(ffmpeg, { mp3, sampleRate, duration });

  const json = join(tmp, `${slug}.json`);
  const doc = patchedTimings({
    stored: timings,
    texts: blocks,
    hash: spokenHash(blocks),
    duration,
    spans: spliced.timings,
    patched: new Set(changed)
  });
  writeFileSync(json, JSON.stringify(doc));
  upload(r2, { slug, mp3, json });
  const delta = duration - timings.duration;
  console.log(
    `${slug}: uploaded, ${timings.duration} s → ${duration} s (${delta >= 0 ? "+" : ""}${delta.toFixed(3)} s)`
  );
}
