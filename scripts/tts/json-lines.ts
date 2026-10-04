// A long-lived child process that talks JSON lines. Each `send` writes one
// line to stdin, and `next` returns the parsed stdout lines in FIFO order.
import { spawn } from "node:child_process";

export function startJsonLines(command: string, args: string[]) {
  const proc = spawn(command, args, { stdio: ["pipe", "pipe", "inherit"] });
  // Queue lines, since two often arrive in one data event with only one waiter.
  let buffer = "";
  const pending: unknown[] = [];
  const waiters: ((msg: unknown) => void)[] = [];
  proc.stdout.on("data", d => {
    buffer += d;
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg: unknown = JSON.parse(line);
      const waiter = waiters.shift();
      if (waiter) waiter(msg);
      else pending.push(msg);
    }
  });
  const next = (): Promise<unknown> =>
    pending.length ? Promise.resolve(pending.shift()) : new Promise(res => waiters.push(res));
  const exited = new Promise<void>(res => proc.on("exit", () => res()));
  return {
    next,
    // Arrow properties, because callers destructure these off the returned object.
    send: (line: string) => {
      proc.stdin.write(`${line}\n`);
    },
    close: async () => {
      proc.stdin.write("quit\n");
      proc.stdin.end();
      await exited;
    }
  };
}
