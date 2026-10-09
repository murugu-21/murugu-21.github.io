// Adds word-level timings to the read-aloud JSON in R2. Runs after
// `bun run audio`; never re-synthesises:
//
//   bun run audio:align              # every post whose JSON is still version 1
//   bun run audio:align first-post   # one post
//   bun run audio:align --force      # re-align version 2 posts too
//   bun run audio:align --local      # target the local R2 that `bun run preview` serves
//
// Poorly aligned blocks keep no `words` (paragraph highlight only).
// Don't run alongside `bun run audio`: both want the GPU.
import { join } from "node:path";

import {
  BLOG_DIST,
  PYTHON,
  alignArgs,
  ffmpeg,
  publishedSlugs,
  requireFfmpeg,
  requirePython,
  runEach
} from "./cli.ts";
import { startJsonLines } from "./json-lines.ts";
import { r2Store } from "./r2.ts";
import { alignPost, whisperClient } from "./align.ts";

const WORKER = join(import.meta.dirname, "whisper.py");

const options = alignArgs(process.argv.slice(2));
const r2 = r2Store(options.local ? "local" : "remote");

requirePython("mlx_whisper");
requireFfmpeg();
r2.checkLogin();
const targets = options.slugs.length ? options.slugs : publishedSlugs(BLOG_DIST);
await using whisper = whisperClient(startJsonLines(PYTHON, [WORKER]));
const failures = await runEach(targets, slug =>
  alignPost({ r2, ffmpeg }, { slug, whisper, force: options.force })
);
if (failures.length) process.exitCode = 1;
