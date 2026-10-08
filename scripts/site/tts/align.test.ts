import { Buffer } from "node:buffer";
import { mkdtempDisposableSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import { alignBlock, alignPost, whisperClient } from "./align.ts";
import { fakeDeps, fakeWhisper } from "./fixtures.ts";
import { jsonLines } from "./json-lines.ts";

describe("alignBlock", () => {
  const block = {
    text: "Hello there world.",
    start: 10,
    end: 12,
    words: [{ w: "stale", s: 10, e: 11 }]
  };

  it("times each word from whisper, absolute within the block", () => {
    const aligned = alignBlock(block, {
      words: [
        { word: " Hello", start: 0.1, end: 0.4 },
        { word: " there", start: 0.5, end: 0.8 },
        { word: " world.", start: 0.9, end: 1.5 }
      ]
    });
    expect(aligned).toEqual({
      block: {
        text: "Hello there world.",
        start: 10,
        end: 12,
        words: [
          { w: "Hello", s: 10.1, e: 10.4 },
          { w: "there", s: 10.5, e: 10.8 },
          { w: "world.", s: 10.9, e: 11.5 }
        ]
      }
    });
  });

  it("keeps only the paragraph timing when whisper fails or hears other words", () => {
    const paragraph = { text: "Hello there world.", start: 10, end: 12 };
    expect(alignBlock(block, { error: "model crashed" })).toEqual({
      block: paragraph,
      problem: "whisper failed: model crashed"
    });
    expect(alignBlock(block, { words: [{ word: "Goodbye", start: 0, end: 0.5 }] })).toEqual({
      block: paragraph,
      problem: "poor match (1 whisper words), paragraph only"
    });
  });
});

describe("whisperClient", () => {
  it("sends each job as one JSON line and parses the reply", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const whisper = whisperClient(
      jsonLines({ command: "whisper.py", stdin, stdout, exited: Promise.resolve() })
    );
    const reply = whisper.transcribe({ id: "b3", wav: "/tmp/align/b3.wav", text: "Hi." });
    stdout.write('{"words":[{"word":" Hi.","start":0,"end":0.4}]}\n');
    expect(await reply).toEqual({ words: [{ word: " Hi.", start: 0, end: 0.4 }] });
    await whisper[Symbol.asyncDispose]();
    expect(String(stdin.read())).toBe('{"id":"b3","wav":"/tmp/align/b3.wav","text":"Hi."}\nquit\n');
  });
});

describe("alignPost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const JSON_KEY = "blog/breeze/fakes.json";
  const MP3_KEY = "blog/breeze/fakes.mp3";
  const rendered = JSON.stringify({
    version: 1,
    slug: "fakes",
    hash: "abc",
    voice: "breeze/test",
    sampleRate: 1000,
    duration: 4.4,
    blocks: [
      { text: "Fakes", start: 0, end: 0.5 },
      { text: "Hello there world.", start: 0.95, end: 2.75 },
      { text: "Goodbye now.", start: 3.2, end: 4.4 }
    ]
  });
  const setup = (root: string) => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { r2, deps } = fakeDeps(root);
    r2.objects.set(JSON_KEY, Buffer.from(rendered));
    r2.objects.set(MP3_KEY, Buffer.alloc(8800));
    return { r2, deps };
  };

  it("adds whisper's word timings to a version 1 post, and passes over a slug with no audio", async () => {
    using root = mkdtempDisposableSync(join(tmpdir(), "align-post-"));
    const { r2, deps } = setup(root.path);

    await alignPost(deps, { slug: "fakes", whisper: fakeWhisper(0.1), force: false });
    await alignPost(deps, { slug: "missing", whisper: fakeWhisper(0.1), force: false });

    expect(r2.json(JSON_KEY)).toEqual({
      version: 2,
      slug: "fakes",
      hash: "abc",
      voice: "breeze/test",
      sampleRate: 1000,
      duration: 4.4,
      blocks: [
        { text: "Fakes", start: 0, end: 0.5, words: [{ w: "Fakes", s: 0, e: 0.1 }] },
        {
          text: "Hello there world.",
          start: 0.95,
          end: 2.75,
          words: [
            { w: "Hello", s: 0.95, e: 1.05 },
            { w: "there", s: 1.05, e: 1.15 },
            { w: "world.", s: 1.15, e: 1.25 }
          ]
        },
        {
          text: "Goodbye now.",
          start: 3.2,
          end: 4.4,
          words: [
            { w: "Goodbye", s: 3.2, e: 3.3 },
            { w: "now.", s: 3.3, e: 3.4 }
          ]
        }
      ]
    });
    expect([...r2.objects.keys()]).toEqual([JSON_KEY, MP3_KEY]);
  });

  it("re-aligns a version 2 post only when forced", async () => {
    using root = mkdtempDisposableSync(join(tmpdir(), "align-post-"));
    const { r2, deps } = setup(root.path);
    await alignPost(deps, { slug: "fakes", whisper: fakeWhisper(0.1), force: false });

    await alignPost(deps, { slug: "fakes", whisper: fakeWhisper(0.2), force: false });
    expect(r2.json(JSON_KEY)).toMatchObject({
      blocks: [
        {},
        {},
        {
          words: [
            { w: "Goodbye", s: 3.2, e: 3.3 },
            { w: "now.", s: 3.3, e: 3.4 }
          ]
        }
      ]
    });

    await alignPost(deps, { slug: "fakes", whisper: fakeWhisper(0.2), force: true });
    expect(r2.json(JSON_KEY)).toMatchObject({
      blocks: [
        {},
        {},
        {
          words: [
            { w: "Goodbye", s: 3.2, e: 3.4 },
            { w: "now.", s: 3.4, e: 3.6 }
          ]
        }
      ]
    });
  });
});
