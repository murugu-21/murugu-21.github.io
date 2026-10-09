// Shared CLI helpers for generate-audio.ts and align-audio.ts.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { SITE_DIR } from "#scripts/site-dir.ts";

// The uv project in this folder (pyproject.toml); `uv sync` creates it.
export const PYTHON = join(import.meta.dirname, ".venv", "bin", "python");
export const BLOG_DIST = join(SITE_DIR, "blog");

const COMMON_OPTIONS = {
  force: { type: "boolean", default: false },
  local: { type: "boolean", default: false }
} as const;

// `bun run audio [slug…] [flags]`; apps/site/scripts/generate-audio.ts lists the flags.
export function audioArgs(args: string[]) {
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

// `bun run audio:align [slug…] [--force] [--local]`
export function alignArgs(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: COMMON_OPTIONS
  });
  return { ...values, slugs: positionals };
}

export function requirePython(module: string): void {
  if (!existsSync(PYTHON))
    throw new Error("no venv; run uv sync --locked --project apps/site/scripts/tts");
  // -P keeps the cwd off sys.path, where the coverage/ report dir would
  // shadow the `coverage` module numba imports.
  if (spawnSync(PYTHON, ["-P", "-c", `import ${module}`]).status !== 0) {
    throw new Error(
      `the venv cannot import ${module}; run uv sync --locked --project apps/site/scripts/tts`
    );
  }
}

export function requireFfmpeg(): void {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) {
    throw new Error("ffmpeg not on PATH (brew install ffmpeg)");
  }
}

export function run(cmd: string, cmdArgs: string[]): string {
  const r = spawnSync(cmd, cmdArgs, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${cmdArgs.join(" ")}\n${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

export function ffmpeg(args: string[]): void {
  run("ffmpeg", ["-y", "-loglevel", "error", ...args]);
}

export type Ffmpeg = typeof ffmpeg;

// Post dirs under the built blog; the post-body check skips the blog's 404.
export function publishedSlugs(blogDist: string): string[] {
  if (!existsSync(blogDist)) throw new Error(`${blogDist} missing; run \`bun run build\` first`);
  return readdirSync(blogDist, { withFileTypes: true })
    .filter(d => {
      const page = join(blogDist, d.name, "index.html");
      return (
        d.isDirectory() &&
        existsSync(page) &&
        readFileSync(page, "utf8").includes("<section data-post-body>")
      );
    })
    .map(d => d.name);
}

// Logs failures instead of stopping; returns the failed slugs.
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
