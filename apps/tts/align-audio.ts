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
import { alignPost, alignerClient } from "./align.ts";

const WORKER = join(import.meta.dirname, "align.py");

const options = alignArgs();
const r2 = r2Store(options.local ? "local" : "remote");

await requirePython("mlx_audio");
await requireFfmpeg();
await r2.checkLogin();
const targets = options.slugs.length ? options.slugs : await publishedSlugs(BLOG_DIST);
await using aligner = alignerClient(startJsonLines(PYTHON, [WORKER]));
const failures = await runEach(targets, slug =>
  alignPost({ r2, ffmpeg }, { slug, aligner, force: options.force })
);
if (failures.length) process.exitCode = 1;
