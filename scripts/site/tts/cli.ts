// Shared CLI helpers for generate-audio.ts and align-audio.ts.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { ROOT, SITE_DIR } from "#scripts/site/site-dir.ts";

export const PYTHON = join(ROOT, ".venv-tts", "bin", "python");
export const BLOG_DIST = join(SITE_DIR, "blog");

export function requirePython(module: string): void {
  if (!existsSync(PYTHON)) throw new Error('no .venv-tts; see README "Read-aloud audio"');
  if (spawnSync(PYTHON, ["-c", `import ${module}`]).status !== 0) {
    throw new Error(
      `.venv-tts cannot import ${module}; reinstall scripts/site/tts/requirements.txt`
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

// Post dirs under the built blog; the post-body check skips the blog's 404.
export function publishedSlugs(): string[] {
  if (!existsSync(BLOG_DIST)) throw new Error(`${BLOG_DIST} missing; run \`bun run build\` first`);
  return readdirSync(BLOG_DIST, { withFileTypes: true })
    .filter(d => {
      const page = join(BLOG_DIST, d.name, "index.html");
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
