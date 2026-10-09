import { Buffer } from "node:buffer";
import { mkdtempDisposableSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeDeps, fakeSynth, refusingSynth, writePost } from "./fixtures.ts";
import { patchPost, renderPost } from "./render.ts";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const JSON_KEY = "blog/breeze/fakes.json";
const MP3_KEY = "blog/breeze/fakes.mp3";
// spokenHash of the fakes post below.
const HASH = "870db11971f499c2f6585e4f6ae3fa1bcc06ce28b41aa7ef9f27e5dcee8e4970";
// Two 180-character sentences, so two chunks.
const LONG = `${"Ab ".repeat(60).trim()}. ${"Cd ".repeat(60).trim()}.`;

describe("renderPost", () => {
  it("renders a new post to an MP3 and its version 1 timings in R2", async () => {
    using root = mkdtempDisposableSync(join(tmpdir(), "render-"));
    const { r2, deps } = fakeDeps(root.path);
    writePost({
      blogDist: root.path,
      slug: "fakes",
      title: "Fakes",
      paragraphs: ["Hello there world.", LONG]
    });

    await renderPost(deps, { slug: "fakes", synth: fakeSynth(), force: false });

    // 0.45 s between blocks, 0.15 s between the long block's two chunks. Leaves out
    // `voice`, which changes only when every post is re-rendered on purpose.
    expect(r2.json(JSON_KEY)).toMatchObject({
      version: 1,
      slug: "fakes",
      hash: HASH,
      sampleRate: 1000,
      duration: 39.35,
      blocks: [
        { text: "Fakes", start: 0, end: 0.5 },
        { text: "Hello there world.", start: 0.95, end: 2.75 },
        { text: LONG, start: 3.2, end: 39.35 }
      ]
    });
    expect(r2.get(MP3_KEY)?.length).toBe(78_700);
  });

  it("skips a post whose spoken text matches the stored hash, unless forced or the text changed", async () => {
    using root = mkdtempDisposableSync(join(tmpdir(), "render-"));
    const { r2, deps } = fakeDeps(root.path);
    writePost({
      blogDist: root.path,
      slug: "fakes",
      title: "Fakes",
      paragraphs: ["Hello there world.", LONG]
    });
    const current = JSON.stringify({ hash: HASH });
    r2.objects.set(JSON_KEY, Buffer.from(current));

    await renderPost(deps, { slug: "fakes", synth: refusingSynth(), force: false });
    expect(String(r2.get(JSON_KEY))).toBe(current);
    expect(r2.get(MP3_KEY)).toBeNull();

    await renderPost(deps, { slug: "fakes", synth: fakeSynth(), force: true });
    expect(r2.get(MP3_KEY)?.length).toBe(78_700);

    r2.objects.set(JSON_KEY, Buffer.from('{"hash":"stale"}'));
    r2.objects.delete(MP3_KEY);
    await renderPost(deps, { slug: "fakes", synth: fakeSynth(), force: false });
    expect(r2.json(JSON_KEY)).toMatchObject({
      hash: HASH,
      duration: 39.35
    });
    expect(r2.get(MP3_KEY)?.length).toBe(78_700);
  });

  it("only extracts on a dry run, then renders once given a synth", async () => {
    using root = mkdtempDisposableSync(join(tmpdir(), "render-"));
    const { r2, deps } = fakeDeps(root.path);
    writePost({ blogDist: root.path, slug: "fakes", title: "Fakes", paragraphs: [LONG] });

    await renderPost(deps, { slug: "fakes", synth: null, force: false });
    expect([...r2.objects.keys()]).toEqual([]);

    await renderPost(deps, { slug: "fakes", synth: fakeSynth(), force: false });
    expect([...r2.objects.keys()]).toEqual([MP3_KEY, JSON_KEY]);
  });
});

describe("patchPost", () => {
  // Aligned audio of "Fakes", "Hello there world." and "Goodbye now." at 1000 Hz.
  const stored = JSON.stringify({
    version: 2,
    slug: "fakes",
    hash: "old",
    voice: "breeze/test",
    sampleRate: 1000,
    duration: 4.4,
    blocks: [
      { text: "Fakes", start: 0, end: 0.5, words: [{ w: "Fakes", s: 0, e: 0.5 }] },
      {
        text: "Hello there world.",
        start: 0.95,
        end: 2.75,
        words: [
          { w: "Hello", s: 0.95, e: 1.55 },
          { w: "there", s: 1.55, e: 2.15 },
          { w: "world.", s: 2.15, e: 2.75 }
        ]
      },
      {
        text: "Goodbye now.",
        start: 3.2,
        end: 4.4,
        words: [
          { w: "Goodbye", s: 3.2, e: 3.8 },
          { w: "now.", s: 3.8, e: 4.4 }
        ]
      }
    ]
  });

  it("splices a re-synthesized paragraph into the stored MP3 and shifts the blocks after it", async () => {
    using root = mkdtempDisposableSync(join(tmpdir(), "patch-"));
    const { r2, deps } = fakeDeps(root.path);
    r2.objects.set(JSON_KEY, Buffer.from(stored));
    r2.objects.set(MP3_KEY, Buffer.alloc(4.4 * 1000 * 2));
    const page = (middle: string) =>
      writePost({
        blogDist: root.path,
        slug: "fakes",
        title: "Fakes",
        paragraphs: [middle, "Goodbye now."]
      });

    page("Hello there world.");
    await patchPost(deps, { slug: "fakes", synth: refusingSynth() });
    expect(String(r2.get(JSON_KEY))).toBe(stored);
    expect(r2.get(MP3_KEY)?.length).toBe(8800);

    // 1.2 s of audio replaces 1.8 s.
    page("Hello world.");
    await patchPost(deps, { slug: "fakes", synth: fakeSynth() });
    expect(r2.json(JSON_KEY)).toEqual({
      version: 2,
      slug: "fakes",
      hash: "02a80e0fa58e17b0357c87fbe9c6ae908d5350afcb80dd41a879334c15aafe20",
      voice: "breeze/test",
      sampleRate: 1000,
      duration: 3.8,
      blocks: [
        { text: "Fakes", start: 0, end: 0.5, words: [{ w: "Fakes", s: 0, e: 0.5 }] },
        { text: "Hello world.", start: 0.95, end: 2.15 },
        {
          text: "Goodbye now.",
          start: 2.6,
          end: 3.8,
          words: [
            { w: "Goodbye", s: 2.6, e: 3.2 },
            { w: "now.", s: 3.2, e: 3.8 }
          ]
        }
      ]
    });
    expect(r2.get(MP3_KEY)?.length).toBe(7600);
  });

  // A stored MP3 that decodes shorter than its timings would shift every splice point.
  it("refuses to patch an MP3 whose length disagrees with its timings", async () => {
    using root = mkdtempDisposableSync(join(tmpdir(), "patch-"));
    const { r2, deps } = fakeDeps(root.path);
    r2.objects.set(JSON_KEY, Buffer.from(stored));
    r2.objects.set(MP3_KEY, Buffer.alloc(4 * 1000 * 2));
    writePost({
      blogDist: root.path,
      slug: "fakes",
      title: "Fakes",
      paragraphs: ["Hello world.", "Goodbye now."]
    });

    await expect(patchPost(deps, { slug: "fakes", synth: fakeSynth() })).rejects.toThrow(
      "decodes to 4.000 s, timings say 4.4 s"
    );
    expect(String(r2.get(JSON_KEY))).toBe(stored);
  });
});
