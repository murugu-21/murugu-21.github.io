// Shared CLI helpers for generate-audio.ts and align-audio.ts.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { SITE_DIR } from "../site-dir.ts";

export const ROOT = resolve(new URL("../..", import.meta.url).pathname);
export const PYTHON = join(ROOT, ".venv-tts", "bin", "python");
export const BLOG_DIST = join(SITE_DIR, "blog");

const args = process.argv.slice(2);
export const flags = new Set(args.filter(a => a.startsWith("--")));
export const slugs = args.filter(a => !a.startsWith("--"));

export const log = (...m: unknown[]) => console.error(...m);
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
export const fail = (msg: string): never => {
  log(`error: ${msg}`);
  process.exit(1);
};

export function requirePython(module: string): void {
  if (!existsSync(PYTHON)) fail('no .venv-tts; see README "Read-aloud audio"');
  if (spawnSync(PYTHON, ["-c", `import ${module}`]).status !== 0) {
    fail(`.venv-tts cannot import ${module}; reinstall scripts/tts/requirements.txt`);
  }
}

export function requireFfmpeg(): void {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) {
    fail("ffmpeg not on PATH (brew install ffmpeg)");
  }
}

export function run(cmd: string, cmdArgs: string[]): string {
  const r = spawnSync(cmd, cmdArgs, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${cmdArgs.join(" ")}\n${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

// Post dirs under the built blog; the articleBody check skips the blog's 404.
export function publishedSlugs(): string[] {
  if (!existsSync(BLOG_DIST)) fail(`${BLOG_DIST} missing; run \`bun run build\` first`);
  return readdirSync(BLOG_DIST, { withFileTypes: true })
    .filter(d => {
      const page = join(BLOG_DIST, d.name, "index.html");
      return (
        d.isDirectory() &&
        existsSync(page) &&
        readFileSync(page, "utf8").includes('itemprop="articleBody"')
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
      log(`${slug} FAILED: ${message(err)}`);
    }
  }
  const minutes = ((Date.now() - t0) / 60000).toFixed(1);
  log(`done in ${minutes} min${failures.length ? `, failed: ${failures.join(", ")}` : ""}`);
  return failures;
}

export function runMain(main: () => Promise<void>): void {
  main().catch((err: unknown) =>
    fail(err instanceof Error ? (err.stack ?? err.message) : String(err))
  );
}
