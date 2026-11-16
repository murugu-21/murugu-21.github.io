import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished, vi } from "vite-plus/test";

export async function emptyPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "gh-path-"));
  vi.stubEnv("PATH", dir);
  onTestFinished(async () => {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true });
  });
  return dir;
}

export async function fakeGh({ stdout = "", stderr = "", status = 0, delaySeconds = 0 }) {
  const gh = join(await emptyPath(), "gh");
  const script = [
    "#!/bin/sh",
    `/bin/sleep ${delaySeconds}`,
    `printf '%s\\0' "$@" > "$0.args"`,
    `/bin/cat "$0.out"`,
    `/bin/cat "$0.err" >&2`,
    `exit ${status}`
  ].join("\n");
  await Promise.all([
    writeFile(`${gh}.out`, stdout),
    writeFile(`${gh}.err`, stderr),
    writeFile(gh, `${script}\n`, { mode: 0o755 })
  ]);
  return { args: async () => (await readFile(`${gh}.args`, "utf8")).split("\0").slice(0, -1) };
}
