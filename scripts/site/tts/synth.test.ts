import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonLines } from "./json-lines.ts";
import { chunkBlock, postBlocks, synthClient } from "./synth.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("postBlocks", () => {
  it("reads the title, then the body's paragraphs and list items, normalized for speech", () => {
    const html = `<html><body><article class="blog-post">
      <header><h1>Floating point 🧮</h1></header>
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

describe("synthClient over synth.py's JSON lines", () => {
  it("reports the model load, logs each chunk and fails a job naming every failed chunk", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const synth = synthClient(
      jsonLines({ command: "synth.py", stdin, stdout, exited: Promise.resolve() })
    );

    stdout.write('{"loadSeconds":12.5,"sampleRate":24000}\n');
    expect(await synth.ready).toEqual({ loadSeconds: 12.5, sampleRate: 24000 });

    const failing = synth.runJob("/tmp/audio-react/job.json");
    // One reply split across writes, as a pipe may deliver it.
    stdout.write('{"id":"b000-c00","seconds":3.25,');
    stdout.write('"wall":9}\n{"id":"b000-c01","error":"empty audio"}\n');
    stdout.write('{"id":"b001-c00","error":"too long"}\n{"done":true}\n');
    await expect(failing).rejects.toThrow(
      "synthesis failed for 2 chunk(s):\nb000-c01: empty audio\nb001-c00: too long"
    );
    expect(log.mock.calls).toEqual([["  b000-c00 3.3s audio in 9s"]]);

    const passing = synth.runJob("/tmp/audio-toolbox/job.json");
    stdout.write('{"id":"b000-c00","seconds":1,"wall":2}\n{"done":true}\n');
    await passing;
    await synth[Symbol.asyncDispose]();

    expect(String(stdin.read())).toBe(
      "/tmp/audio-react/job.json\n/tmp/audio-toolbox/job.json\nquit\n"
    );
    expect(stdin.writableEnded).toBe(true);
  });
});
