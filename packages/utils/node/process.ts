import { spawn } from "node:child_process";
import { once } from "node:events";
import { buffer, text } from "node:stream/consumers";

export async function spawnCollect(cmd: string, args: string[]) {
  const child = spawn(cmd, args);
  const [stdout, stderr] = await Promise.all([
    buffer(child.stdout),
    text(child.stderr),
    once(child, "close")
  ]);
  return { status: child.exitCode, stdout, stderr };
}

export async function spawnInherit(cmd: string, args: string[]): Promise<number | null> {
  const child = spawn(cmd, args, { stdio: "inherit" });
  await once(child, "close");
  return child.exitCode;
}
