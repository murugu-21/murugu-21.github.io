// Adds word-level timings to the read-aloud JSON already in R2, so the page
// can highlight the word being spoken. Runs on the author's laptop after
// `bun run audio`; never re-synthesises anything:
//
//   bun run audio:align              # every post whose JSON is still version 1
//   bun run audio:align first-post   # one post
//   bun run audio:align --force   # re-align version 2 posts too
//   bun run audio:align --local   # target `wrangler dev`'s local R2
//
// Per post: fetch <slug>.json + .mp3 → decode to 16 kHz mono → slice each
// block by its timings → mlx-whisper word timestamps (scripts/tts/whisper.py,
// long-lived worker) → alignWords() maps them onto the block's known text →
// write version 2 JSON back. Blocks that align poorly keep no `words` and
// fall back to the paragraph highlight. Do not run while `bun run audio` is
// synthesising: both want the GPU.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { alignWords, type TimedWord, type WhisperWord } from "../src/blog/utils/audio-words.ts";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const PYTHON = join(ROOT, ".venv-tts", "bin", "python");
const WORKER = join(ROOT, "scripts", "tts", "whisper.py");
const BUCKET = "murugappan-dev-audio";

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith("--")));
const slugs = args.filter(a => !a.startsWith("--"));
const local = flags.has("--local");

const log = (...m: unknown[]) => console.error(...m);
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const fail = (msg: string): never => {
  log(`error: ${msg}`);
  process.exit(1);
};

function run(cmd: string, cmdArgs: string[]): string {
  const r = spawnSync(cmd, cmdArgs, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${cmdArgs.join(" ")}\n${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

const wranglerArgs = (extra: string[]) => [
  "wrangler",
  "r2",
  "object",
  ...extra,
  local ? "--local" : "--remote"
];

// False only when the object is genuinely absent. Any other wrangler failure
// (expired login, network) throws, so a broken session can never be mistaken
// for "nothing there yet".
function r2Get(key: string, file: string): boolean {
  const r = spawnSync("bunx", wranglerArgs(["get", `${BUCKET}/${key}`, "--file", file]), {
    encoding: "utf8"
  });
  if (r.status === 0 && existsSync(file)) return true;
  const err = `${r.stderr}\n${r.stdout}`;
  if (/not found|does not exist|NoSuchKey|10007/i.test(err)) return false;
  throw new Error(`wrangler r2 object get ${key} failed:\n${err.trim()}`);
}

// Fail fast when wrangler cannot talk to Cloudflare, instead of finding out
// after minutes (or hours) of local work.
function checkWranglerLogin() {
  if (local) return;
  const r = spawnSync("bunx", ["wrangler", "whoami"], { encoding: "utf8" });
  if (r.status !== 0 || /not logged in|expired/i.test(`${r.stderr}${r.stdout}`)) {
    fail(
      "wrangler is not logged in (or the OAuth token expired) — run `bunx wrangler login` in an interactive terminal, then retry"
    );
  }
}

function r2Put(key: string, file: string, contentType: string) {
  run(
    "bunx",
    wranglerArgs(["put", `${BUCKET}/${key}`, "--file", file, "--content-type", contentType])
  );
}

// Every slug with a JSON in the bucket. `wrangler r2 object` has no list
// command, so the blog's own dist/ directory is the source of candidates.
function publishedSlugs(): string[] {
  const dist = join(ROOT, "dist", "blog");
  if (!existsSync(dist)) fail("dist/blog missing — run `bun run build` first");
  return run("ls", [dist])
    .split("\n")
    .filter(
      d =>
        d &&
        existsSync(join(dist, d, "index.html")) &&
        readFileSync(join(dist, d, "index.html"), "utf8").includes('itemprop="articleBody"')
    );
}

// ---- whisper worker ---------------------------------------------------------

// One JSON line back from scripts/tts/whisper.py per transcribe() job.
interface WhisperReply {
  error?: string;
  words?: WhisperWord[];
}

function startWorker() {
  const proc = spawn(PYTHON, [WORKER], { stdio: ["pipe", "pipe", "inherit"] });
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
  const next = () =>
    pending.length
      ? Promise.resolve(pending.shift())
      : new Promise<unknown>(res => waiters.push(res));
  const exited = new Promise<void>(res => proc.on("exit", () => res()));
  return {
    async transcribe(job: { id: string; wav: string; text: string }): Promise<WhisperReply> {
      proc.stdin.write(`${JSON.stringify(job)}\n`);
      return (await next()) as WhisperReply;
    },
    async close() {
      proc.stdin.write("quit\n");
      proc.stdin.end();
      await exited;
    }
  };
}

type Worker = ReturnType<typeof startWorker>;

// The timing JSON written by generate-audio.ts (version 1) and rewritten here
// with per-word times (version 2); mirrors src/blog/utils/audio-sync.ts.
interface TimingBlock {
  text: string;
  start: number;
  end: number;
  words?: TimedWord[];
}
interface Timings {
  version: number;
  blocks: TimingBlock[];
}

// ---- per-post -----------------------------------------------------------------

async function alignPost(slug: string, worker: Worker) {
  const tmp = mkdtempSync(join(tmpdir(), `align-${slug}-`));
  try {
    const jsonPath = join(tmp, "timings.json");
    const mp3 = join(tmp, "post.mp3");
    if (!r2Get(`blog/breeze/${slug}.json`, jsonPath)) {
      log(`${slug}: no audio in R2, skipping`);
      return "skipped";
    }
    const timings = JSON.parse(readFileSync(jsonPath, "utf8")) as Timings;
    if (timings.version >= 2 && !flags.has("--force")) {
      log(`${slug}: already aligned, skipping`);
      return "skipped";
    }
    if (!r2Get(`blog/breeze/${slug}.mp3`, mp3)) throw new Error("mp3 missing in R2");

    const wav = join(tmp, "post.wav");
    run("ffmpeg", ["-y", "-loglevel", "error", "-i", mp3, "-ac", "1", "-ar", "16000", wav]);

    let aligned = 0;
    const blocks: TimingBlock[] = [];
    for (const [i, block] of timings.blocks.entries()) {
      const slice = join(tmp, `b${i}.wav`);
      run("ffmpeg", [
        "-y",
        "-loglevel",
        "error",
        "-ss",
        String(block.start),
        "-to",
        String(block.end),
        "-i",
        wav,
        slice
      ]);
      const reply = await worker.transcribe({
        id: `b${i}`,
        wav: slice,
        text: block.text
      });
      const { words: _drop, ...rest } = block;
      if (reply.error) {
        log(`  b${i}: whisper failed — ${reply.error}`);
        blocks.push(rest);
        continue;
      }
      const whisperWords = reply.words ?? [];
      const words = alignWords(block.text, whisperWords, block);
      if (words) {
        aligned++;
        blocks.push({ ...rest, words });
      } else {
        log(`  b${i}: poor match (${whisperWords.length} whisper words), paragraph only`);
        blocks.push(rest);
      }
    }

    const out = { ...timings, version: 2, blocks };
    writeFileSync(jsonPath, JSON.stringify(out));
    r2Put(`blog/breeze/${slug}.json`, jsonPath, "application/json");
    log(`${slug}: aligned ${aligned}/${blocks.length} blocks`);
    return "aligned";
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- main ------------------------------------------------------------------------

async function main() {
  if (!existsSync(PYTHON)) fail('no .venv-tts — see README "Read-aloud audio"');
  if (spawnSync(PYTHON, ["-c", "import mlx_whisper"]).status !== 0) {
    fail(".venv-tts cannot import mlx_whisper — pip install -r scripts/tts/requirements.txt");
  }
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) fail("ffmpeg not on PATH");

  checkWranglerLogin();
  const targets = slugs.length ? slugs : publishedSlugs();
  const worker = startWorker();
  const failures: string[] = [];
  const t0 = Date.now();
  try {
    for (const slug of targets) {
      try {
        await alignPost(slug, worker);
      } catch (err) {
        failures.push(slug);
        log(`${slug}: FAILED — ${message(err)}`);
      }
    }
  } finally {
    await worker.close();
  }
  const minutes = ((Date.now() - t0) / 60000).toFixed(1);
  log(`done in ${minutes} min${failures.length ? `, failed: ${failures.join(", ")}` : ""}`);
  if (failures.length) process.exit(1);
}

main().catch((err: unknown) =>
  fail(err instanceof Error ? (err.stack ?? err.message) : String(err))
);
