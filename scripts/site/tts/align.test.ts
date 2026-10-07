import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";

import { alignBlock, whisperClient } from "./align.ts";
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
