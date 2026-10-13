import { PassThrough } from "node:stream";
import { expect, it } from "vite-plus/test";
import { z } from "zod";

import { jsonLines } from "./json-lines.ts";

const Reply = z.object({ words: z.array(z.string()) });

function whisperSent(output: string) {
  const stdout = new PassThrough();
  const channel = jsonLines({
    command: "whisper.py",
    stdin: new PassThrough(),
    stdout,
    exited: Promise.resolve()
  });
  stdout.end(output);
  return channel;
}

it("rejects a read once the process closes stdout, after the replies it did send", async () => {
  const channel = whisperSent('{"words":[]}\n');
  expect(await channel.next(Reply)).toEqual({ words: [] });
  await expect(channel.next(Reply)).rejects.toThrow("whisper.py closed stdout");
});

it("names the command and the line when a stdout line is not JSON or not a reply", async () => {
  const channel = whisperSent('UserWarning: FP16 is not supported on CPU\n{"words":[1]}\n');
  await expect(channel.next(Reply)).rejects.toThrow(
    new Error(
      "whisper.py sent an unexpected line: UserWarning: FP16 is not supported on CPU\n✖ must be valid JSON"
    )
  );
  await expect(channel.next(Reply)).rejects.toThrow(
    new Error(
      'whisper.py sent an unexpected line: {"words":[1]}\n✖ Invalid input: expected string, received number\n  → at words[0]'
    )
  );
});
