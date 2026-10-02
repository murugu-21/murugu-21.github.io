// Shared CLI helpers for generate-audio.ts and align-audio.ts.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const log = (...m: unknown[]) => console.error(...m);
export const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
export const fail = (msg: string): never => {
  log(`error: ${msg}`);
  process.exit(1);
};

export function run(cmd: string, cmdArgs: string[]): string {
  const r = spawnSync(cmd, cmdArgs, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${cmdArgs.join(" ")}\n${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

// Post dirs under the built blog; the articleBody check skips the blog's 404.
export function publishedSlugs(dist: string): string[] {
  if (!existsSync(dist)) fail(`${dist} missing — run \`bun run build\` first`);
  return readdirSync(dist, { withFileTypes: true })
    .filter(d => {
      const page = join(dist, d.name, "index.html");
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
  fn: (slug: string) => Promise<unknown>
): Promise<string[]> {
  const failures: string[] = [];
  const t0 = Date.now();
  for (const slug of slugs) {
    try {
      await fn(slug);
    } catch (err) {
      failures.push(slug);
      log(`${slug}: FAILED — ${message(err)}`);
    }
  }
  const minutes = ((Date.now() - t0) / 60000).toFixed(1);
  log(`done in ${minutes} min${failures.length ? `, failed: ${failures.join(", ")}` : ""}`);
  return failures;
}
