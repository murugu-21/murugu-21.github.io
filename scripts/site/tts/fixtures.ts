// Fakes for the per-post tests: R2 in memory, an ffmpeg that copies its input
// to its output, a synth whose chunks last 0.1 s per character, and a whisper
// that hears every word. Bytes flow through the real pipeline, so timings stay
// consistent with the audio. Also starts the real Python processes on the MLX fakes.
import { Buffer } from "node:buffer";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { onTestFinished, vi } from "vitest";
import { z } from "zod";

import { jsonString } from "#utils/json.ts";
import { type Ffmpeg, PYTHON, requirePython } from "./cli.ts";
import { type JsonLines, startJsonLines } from "./json-lines.ts";
import type { RenderDeps, Synth } from "./render.ts";

function memoryR2() {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    get: (key: string) => objects.get(key) ?? null,
    json: (key: string): unknown => {
      const body = objects.get(key);
      return body ? JSON.parse(body.toString()) : null;
    },
    put: ({ key, file }: { key: string; file: string }) => {
      objects.set(key, readFileSync(file));
    }
  };
}

const copyingFfmpeg: Ffmpeg = args => {
  const input = args[args.lastIndexOf("-i") + 1];
  const output = args.at(-1);
  if (!input || !output) throw new Error(`no input or output in ffmpeg ${args.join(" ")}`);
  copyFileSync(input, output);
};

const Job = jsonString(
  z.object({ outDir: z.string(), chunks: z.array(z.object({ id: z.string(), text: z.string() })) })
);

// Posts and render dirs both go under `root`.
export function fakeDeps(root: string) {
  const r2 = memoryR2();
  return {
    r2,
    deps: {
      r2,
      ffmpeg: copyingFfmpeg,
      blogDist: root,
      tmpRoot: root,
      settings: { tempo: 1.08, postfx: "loudnorm=I=-16" }
    } satisfies RenderDeps
  };
}

// 1000 Hz, 100 samples (0.1 s) per character.
export const fakeSynth = (): Synth => ({
  worker: {
    runJob: jobPath => {
      const { outDir, chunks } = Job.parse(readFileSync(jobPath, "utf8"));
      mkdirSync(outDir, { recursive: true });
      for (const { id, text } of chunks) {
        writeFileSync(join(outDir, `${id}.wav`), Buffer.alloc(text.length * 100 * 2));
      }
      return Promise.resolve();
    }
  },
  reference: { audio: "reference.wav", text: "Reference." },
  sampleRate: 1000
});

export const refusingSynth = (): Synth => ({
  ...fakeSynth(),
  worker: { runJob: () => Promise.reject(new Error("must not synthesize")) }
});

// Hears each word of the block's text, `secondsPerWord` apart from the slice start.
export const fakeWhisper = (secondsPerWord: number) => ({
  transcribe: ({ text }: { text: string }) =>
    Promise.resolve({
      words: text.split(" ").map((word, i) => ({
        word: ` ${word}`,
        start: i * secondsPerWord,
        end: (i + 1) * secondsPerWord
      }))
    })
});

export function writePost({
  blogDist,
  slug,
  title,
  paragraphs
}: {
  blogDist: string;
  slug: string;
  title: string;
  paragraphs: string[];
}) {
  mkdirSync(join(blogDist, slug), { recursive: true });
  const body = paragraphs.map(p => `<p>${p}</p>`).join("\n");
  writeFileSync(
    join(blogDist, slug, "index.html"),
    `<html><body><article><h1 data-post-title>${title}</h1>
<section data-post-body>${body}<pre><code>skipped()</code></pre></section></article></body></html>`
  );
}

/** synth.py or whisper.py running on the MLX fakes (fakes/README.md). */
export function startOnFakes(script: "synth.py" | "whisper.py"): JsonLines {
  requirePython("numpy");
  vi.stubEnv("PYTHONPATH", join(import.meta.dirname, "fakes"));
  onTestFinished(() => {
    vi.unstubAllEnvs();
  });
  return startJsonLines(PYTHON, [join(import.meta.dirname, script)]);
}
