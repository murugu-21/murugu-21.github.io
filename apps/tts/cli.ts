import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { exists, ifPresent } from "@murugappan/utils/node/fs.ts";
import { spawnCollect } from "@murugappan/utils/node/process.ts";

export const PYTHON = join(import.meta.dirname, ".venv", "bin", "python");
export const BLOG_DIST = join(import.meta.dirname, "..", "site", "dist", "blog");

const COMMON_OPTIONS = {
  force: { type: "boolean", default: false },
  local: { type: "boolean", default: false }
} as const;

export function audioArgs(args?: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      ...COMMON_OPTIONS,
      "dry-run": { type: "boolean", default: false },
      patch: { type: "boolean", default: false },
      "upload-voice": { type: "boolean", default: false }
    }
  });
  return { ...values, slugs: positionals };
}

export function alignArgs(args?: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: COMMON_OPTIONS
  });
  return { ...values, slugs: positionals };
}

export async function requirePython(module: string): Promise<void> {
  if (!(await exists(PYTHON))) throw new Error("no venv; run uv sync --locked --project apps/tts");
  if ((await spawnCollect(PYTHON, ["-c", `import ${module}`])).status !== 0) {
    throw new Error(`the venv cannot import ${module}; run uv sync --locked --project apps/tts`);
  }
}

export async function requireFfmpeg(): Promise<void> {
  const r = await spawnCollect("ffmpeg", ["-version"]).catch(() => null);
  if (r?.status !== 0) throw new Error("ffmpeg not on PATH (brew install ffmpeg)");
}

export async function run(cmd: string, cmdArgs: string[]): Promise<string> {
  const r = await spawnCollect(cmd, cmdArgs);
  if (r.status !== 0) {
    throw new Error(`${cmd} ${cmdArgs.join(" ")}\n${r.stderr || r.stdout.toString()}`);
  }
  return r.stdout.toString();
}

export async function ffmpeg(args: string[]): Promise<void> {
  await run("ffmpeg", ["-y", "-loglevel", "error", ...args]);
}

export type Ffmpeg = typeof ffmpeg;

const hasPostBody = async (page: string) =>
  (await ifPresent(readFile(page, "utf8")))?.includes("<section data-post-body>") ?? false;

export async function publishedSlugs(blogDist: string): Promise<string[]> {
  if (!(await exists(blogDist))) {
    throw new Error(`${blogDist} missing; run \`bun run build\` first`);
  }
  const dirs = (await readdir(blogDist, { withFileTypes: true })).filter(d => d.isDirectory());
  const slugs = await Promise.all(
    dirs.map(async d => ((await hasPostBody(join(blogDist, d.name, "index.html"))) ? [d.name] : []))
  );
  return slugs.flat();
}

export async function runEach(
  slugs: string[],
  fn: (slug: string) => Promise<void>
): Promise<string[]> {
  const failures: string[] = [];
  const t0 = Date.now();
  for (const slug of slugs) {
    try {
      await fn(slug);
    } catch (err) {
      failures.push(slug);
      console.log(`${slug} FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const minutes = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`done in ${minutes} min${failures.length ? `, failed: ${failures.join(", ")}` : ""}`);
  return failures;
}
