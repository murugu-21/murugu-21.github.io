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
