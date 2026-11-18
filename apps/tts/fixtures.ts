import { Buffer } from "node:buffer";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { onTestFinished, vi } from "vite-plus/test";
import { z } from "zod";

import { JsonRecord, jsonString } from "@murugappan/utils/json.ts";
import { type Ffmpeg, PYTHON, requirePython } from "./cli.ts";
import { type JsonLines, startJsonLines } from "./json-lines.ts";
import type { RenderDeps, Synth } from "./render.ts";

function memoryR2() {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    get: (key: string) => Promise.resolve(objects.get(key) ?? null),
    json: (key: string) => {
      const body = objects.get(key);
      return body ? jsonString(JsonRecord).parse(body.toString()) : null;
    },
    put: async ({ key, file }: { key: string; file: string }) => {
      objects.set(key, await readFile(file));
    }
  };
}

const copyingFfmpeg: Ffmpeg = async args => {
  const input = args[args.lastIndexOf("-i") + 1];
  const output = args.at(-1);
  if (!input || !output) throw new Error(`no input or output in ffmpeg ${args.join(" ")}`);
  await copyFile(input, output);
};

const Job = jsonString(
  z.object({ outDir: z.string(), chunks: z.array(z.object({ id: z.string(), text: z.string() })) })
);

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

export const fakeSynth = (): Synth => ({
  worker: {
    runJob: async jobPath => {
      const { outDir, chunks } = Job.parse(await readFile(jobPath, "utf8"));
      await mkdir(outDir, { recursive: true });
      await Promise.all(
        chunks.map(({ id, text }) =>
          writeFile(join(outDir, `${id}.wav`), Buffer.alloc(text.length * 100 * 2))
        )
      );
    }
  },
  reference: { audio: "reference.wav", text: "Reference." },
  sampleRate: 1000
});

export const refusingSynth = (): Synth => ({
  ...fakeSynth(),
  worker: { runJob: () => Promise.reject(new Error("must not synthesize")) }
});

export const fakeAligner = (secondsPerWord: number) => ({
  align: ({ text }: { text: string }) =>
    Promise.resolve({
      words: text.split(" ").map((word, i) => ({
        word,
        start: i * secondsPerWord,
        end: (i + 1) * secondsPerWord
      }))
    })
});

export async function writePost({
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
  await mkdir(join(blogDist, slug), { recursive: true });
  const body = paragraphs.map(p => `<p>${p}</p>`).join("\n");
  await writeFile(
    join(blogDist, slug, "index.html"),
    `<html><body><article><h1 data-post-title>${title}</h1>
<section data-post-body>${body}<pre><code>skipped()</code></pre></section></article></body></html>`
  );
}

export async function startOnFakes(script: "synth.py" | "align.py"): Promise<JsonLines> {
  await requirePython("numpy");
  vi.stubEnv("PYTHONPATH", join(import.meta.dirname, "fakes"));
  onTestFinished(() => {
    vi.unstubAllEnvs();
  });
  return startJsonLines(PYTHON, [join(import.meta.dirname, script)]);
}
