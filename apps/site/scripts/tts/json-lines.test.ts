import { PassThrough } from "node:stream";
import { expect, it } from "vitest";

import { jsonLines } from "./json-lines.ts";

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
