// A long-lived child process that talks JSON lines: each `send` writes one
// line to stdin, each stdout line is parsed and handed out FIFO.
import { spawn } from "node:child_process";

export function startJsonLines(command: string, args: string[]) {
  const proc = spawn(command, args, { stdio: ["pipe", "pipe", "inherit"] });
  // Lines are queued, not dropped: two lines often arrive in one data event
  // (the last chunk report and the "done" line), and the consumer only has a
  // waiter registered for the first of them.
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
    send(line: string) {
      proc.stdin.write(`${line}\n`);
    },
    async close() {
      proc.stdin.write("quit\n");
      proc.stdin.end();
      await exited;
    }
  };
}
