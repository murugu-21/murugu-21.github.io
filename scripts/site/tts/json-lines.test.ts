import { PassThrough } from "node:stream";
import { expect, it } from "vitest";

import { jsonLines, startJsonLines } from "./json-lines.ts";

// Echoes each stdin line back as JSON until `quit`, like synth.py and whisper.py.
const ECHO_WORKER = `
const lines = require("node:readline").createInterface({ input: process.stdin });
lines.on("line", line => {
  if (line === "quit") process.exit(0);
  process.stdout.write(JSON.stringify({ echo: line }) + "\\n");
});
`;

it("talks JSON lines to a real child process and waits for it to exit on close", async () => {
  const worker = startJsonLines(process.execPath, ["-e", ECHO_WORKER]);
  worker.send("/tmp/job-1.json");
  worker.send("/tmp/job-2.json");
  expect(await worker.next()).toEqual({ echo: "/tmp/job-1.json" });
  expect(await worker.next()).toEqual({ echo: "/tmp/job-2.json" });
  await worker.close();
});

it("rejects a read once the process closes stdout, after the replies it did send", async () => {
  const stdout = new PassThrough();
  const channel = jsonLines({
    command: "whisper.py",
    stdin: new PassThrough(),
    stdout,
    exited: Promise.resolve()
  });
  stdout.end('{"words":[]}\n');
  expect(await channel.next()).toEqual({ words: [] });
  await expect(channel.next()).rejects.toThrow("whisper.py closed stdout");
});
