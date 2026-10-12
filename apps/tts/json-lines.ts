// A long-lived child process that talks JSON lines. Each `send` writes one
// line to stdin, and `next` parses the stdout lines with a schema in FIFO order.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { z } from "zod";

import { jsonString } from "@murugappan/utils/json.ts";

export function jsonLines({
  command,
  stdin,
  stdout,
  exited
}: {
  command: string;
  stdin: Writable;
  stdout: Readable;
  exited: Promise<void>;
}) {
  const lines = createInterface({ input: stdout })[Symbol.asyncIterator]();
  return {
    // Arrow properties, because callers destructure these off the returned object.
    next: async <S extends z.ZodType>(schema: S): Promise<z.infer<S>> => {
      const { value, done } = await lines.next();
      // stdout can end before "exit" fires; let the exit handler report the code.
      if (done) {
        await exited;
        throw new Error(`${command} closed stdout`);
      }
      const reply = jsonString(schema).safeParse(value);
      if (!reply.success) {
        throw new Error(
          `${command} sent an unexpected line: ${value}\n${z.prettifyError(reply.error)}`
        );
      }
      return reply.data;
    },
    send: (line: string) => {
      stdin.write(`${line}\n`);
    },
    close: async () => {
      stdin.write("quit\n");
      stdin.end();
      await exited;
    }
  };
}

export type JsonLines = ReturnType<typeof jsonLines>;

export function startJsonLines(command: string, args: string[]): JsonLines {
  const proc = spawn(command, args, { stdio: ["pipe", "pipe", "inherit"] });
  // A crashed worker never replies, and Bun spins forever on the pending await
  // even after an uncaught throw, so exit outright. Only `close` ends stdin.
  const exited = new Promise<void>(res =>
    proc.on("exit", code => {
      if (proc.stdin.writableEnded) return res();
      console.error(`error: ${command} exited with code ${code}`);
      process.exit(1);
    })
  );
  return jsonLines({ command, stdin: proc.stdin, stdout: proc.stdout, exited });
}
