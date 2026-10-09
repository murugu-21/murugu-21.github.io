import { mkdtempDisposableSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { startOnFakes } from "./fixtures.ts";
import { type Chunk, chunkBlock, postBlocks, synthClient } from "./synth.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("postBlocks", () => {
  it("reads the title, then the body's paragraphs and list items, normalized for speech", () => {
    const html = `<html><body><article>
      <header><h1 data-post-title>Floating point 🧮</h1></header>
      <section data-post-body>
        <p>Is 0.1 + 0.2
           equal to 0.3?!</p>
        <pre><code>console.log(0.1 + 0.2)</code></pre>
        <ul><li>It prints 0.30000000000000004.</li><li>Not 0.3.</li></ul>
        <p>   </p>
      </section>
    </article></body></html>`;
    expect(postBlocks({ slug: "floating-point", html })).toEqual([
      "Floating point",
      "Is 0.1 + 0.2 equal to 0.3?",
      "It prints 0.3, then zero repeated 15 times, then 4.",
      "Not 0.3."
    ]);
    expect(() => postBlocks({ slug: "404", html: "<main><p>Not found</p></main>" })).toThrow(
      "404: no post body section"
    );
  });
});

describe("chunkBlock", () => {
  it("packs a block's sentences into chunks of at most 300 characters, ided by block and chunk", () => {
    const long = (word: string) => `${word} ${"la ".repeat(60).trim()}.`;
    const text = `${long("One")} ${long("Two")} Done.`;
    expect(chunkBlock(text, 7)).toEqual([
      { id: "b007-c00", text: long("One") },
      { id: "b007-c01", text: `${long("Two")} Done.` }
    ]);
  });
});

/** A WAV's rate and length from the header synth.py writes, plus its first sample. */
function wavInfo(path: string) {
  const wav = readFileSync(path);
  return {
    sampleRate: wav.readUInt32LE(24),
    frames: wav.readUInt32LE(40) / 2,
    first: wav.readInt16LE(44)
  };
}

describe("synth.py through synthClient", () => {
  it("writes each chunk as a WAV, names every failed chunk, and keeps serving the next job", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    using dir = mkdtempDisposableSync(join(tmpdir(), "synth-"));
    const job = (slug: string, chunks: Chunk[]) => {
      const path = join(dir.path, `${slug}.json`);
      const reference = { audio: "reference.wav", text: "Reference." };
      writeFileSync(path, JSON.stringify({ outDir: join(dir.path, slug), reference, chunks }));
      return path;
    };
    // The fakes print while loading and generating, as mlx-audio does, so a stray
    // stdout line would break the JSON protocol here.
    await using synth = synthClient(startOnFakes("synth.py"));
    expect((await synth.ready).sampleRate).toBe(24000);

    const failing = synth.runJob(
      job("react", [
        { id: "b000-c00", text: "Hello there." },
        { id: "b000-c01", text: "[raise]" },
        { id: "b001-c00", text: "[rate] Hi." },
        { id: "b001-c01", text: "[silent]" }
      ])
    );
    await expect(failing).rejects.toThrow(
      "synthesis failed for 3 chunk(s):\n" +
        "b000-c01: RuntimeError: fake model failure\n" +
        "b001-c00: RuntimeError: unexpected sample rate 22050\n" +
        "b001-c01: RuntimeError: model produced no audio"
    );
    expect(readdirSync(join(dir.path, "react"))).toEqual(["b000-c00.wav"]);
    // 12 characters at 10 ms each, at 0.5 amplitude.
    expect(wavInfo(join(dir.path, "react", "b000-c00.wav"))).toEqual({
      sampleRate: 24000,
      frames: 2880,
      first: 16383
    });

    await synth.runJob(job("toolbox", [{ id: "b000-c00", text: "Bye." }]));
    expect(wavInfo(join(dir.path, "toolbox", "b000-c00.wav")).frames).toBe(960);
    expect(log.mock.calls.map(([line]) => String(line).replace(/in [\d.]+s$/, "in Ns"))).toEqual([
      "  b000-c00 0.1s audio in Ns",
      "  b000-c00 0.0s audio in Ns"
    ]);
  });
});
