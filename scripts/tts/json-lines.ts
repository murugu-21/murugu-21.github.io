// A long-lived child process that talks JSON lines. Each `send` writes one
// line to stdin, and `next` returns the parsed stdout lines in FIFO order.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export function startJsonLines(command: string, args: string[]) {
  const proc = spawn(command, args, { stdio: ["pipe", "pipe", "inherit"] });
  const lines = createInterface({ input: proc.stdout })[Symbol.asyncIterator]();
  // A crashed worker never replies, and Bun spins forever on the pending await
  // even after an uncaught throw, so exit outright.
  let closing = false;
  const exited = new Promise<void>(res =>
    proc.on("exit", code => {
      if (closing) return res();
      console.error(`error: ${command} exited with code ${code}`);
      process.exit(1);
    })
  );
  return {
    // Arrow properties, because callers destructure these off the returned object.
    next: async (): Promise<unknown> => {
      const { value, done } = await lines.next();
      // stdout can end before "exit" fires; let the exit handler report the code.
      if (done) {
        await exited;
        throw new Error(`${command} closed stdout`);
      }
      return JSON.parse(value);
    },
    send: (line: string) => {
      proc.stdin.write(`${line}\n`);
    },
    close: async () => {
      closing = true;
      proc.stdin.write("quit\n");
      proc.stdin.end();
      await exited;
    }
  };
}
