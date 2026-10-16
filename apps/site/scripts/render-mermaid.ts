import {
  existsSync,
  globSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { renderMermaid } from "@mermaid-js/mermaid-cli";
import type { Browser } from "puppeteer";
import sharp from "sharp";
import subsetFont from "subset-font";
import { z } from "zod";

import { jsonString } from "@murugappan/utils/json.ts";
import { FIRA_CODE_FEATURES, FIRA_CODE_VF } from "./fira-code-subset.ts";
import { launchBrowser } from "./launch-browser.ts";
import { DIAGRAMS_DIR, type DiagramTheme } from "#src/lib/blog/mermaid-diagrams.ts";
import {
  type Job,
  type Render,
  diagramJobs,
  orphans,
  pendingRenders,
  retryRenders,
  variantLabel
} from "./diagram-plan.ts";
import {
  THEMES,
  cssUrl,
  finishSvg,
  fontFace,
  renderOptions,
  stampOf,
  usedText
} from "./mermaid-svg.ts";

// An SVG in <img> can't reach page fonts, so each embeds a Fira Code subset;
// otherwise a substitute face's widths make labels overrun their boxes.

const CONTENT_DIR = join(
  dirname(fileURLToPath(import.meta.resolve("@murugappan/content/package.json"))),
  "blog"
);
// mermaid-cli's own mermaid, resolved from mermaid-cli. Its exports hide package.json, so
// this resolves the entry and reads the manifest beside its dist/ folder.
const MERMAID_ENTRY = createRequire(
  fileURLToPath(import.meta.resolve("@mermaid-js/mermaid-cli"))
).resolve("mermaid");
const MERMAID_VERSION = jsonString(z.object({ version: z.string() })).parse(
  readFileSync(
    join(MERMAID_ENTRY.slice(0, MERMAID_ENTRY.lastIndexOf("/dist/")), "package.json"),
    "utf8"
  )
).version;
const FONT = readFileSync(FIRA_CODE_VF);
const PAGE_FONT = cssUrl(fontFace(FONT));

const STAMP = `mermaid@${MERMAID_VERSION}`;
const isCurrent = (path: string) =>
  existsSync(path) && stampOf(readFileSync(path, "utf8")) === STAMP;

const RENDER_WORKERS = 4;
// On CI, Chrome sometimes stops answering (a screenshot that never returns) and stalls the
// renders behind it, which take 1-3 s each, so time out early and retry in a fresh browser.
const PROTOCOL_TIMEOUT_MS = 30_000;
const RENDER_ATTEMPTS = 3;
const PNG_VIEWPORT = { width: 4000, height: 900, deviceScaleFactor: 2 };
// mermaid-cli shrinks the viewport to the diagram's right edge, ignoring the
// body's right margin, so the 100%-wide SVG would draw that much narrower.
const NO_BODY_MARGIN = cssUrl("body{margin:0}");
const PNG_PADDING = 24;

const { values: options } = parseArgs({ options: { force: { type: "boolean" } } });
const force = options.force ?? false;

const rel = (path: string) => relative(process.cwd(), path);

async function renderSvg({
  browser,
  job,
  theme
}: {
  browser: Browser;
  job: Job;
  theme: DiagramTheme;
}): Promise<string> {
  const { data } = await renderMermaid(browser, job.source, "svg", {
    ...renderOptions({ hash: job.hash, theme, pageFont: PAGE_FONT }),
    // mermaid-cli's own embedding would inline every Unicode range whole
    fontEmbed: false
  });
  const svg = Buffer.from(data).toString("utf8");
  const subset = await subsetFont(FONT, usedText(svg), {
    targetFormat: "woff2",
    keepFeatures: FIRA_CODE_FEATURES
  });
  return finishSvg({ svg, stamp: STAMP, subset });
}

async function renderPng({ browser, job }: { browser: Browser; job: Job }): Promise<Buffer> {
  const { data } = await renderMermaid(browser, job.source, "png", {
    ...renderOptions({ hash: job.hash, theme: "light", pageFont: PAGE_FONT }),
    customFontCSS: [{ cssUrl: PAGE_FONT }, { cssUrl: NO_BODY_MARGIN }],
    viewport: PNG_VIEWPORT
  });
  return sharp(data)
    .extend({
      top: PNG_PADDING,
      bottom: PNG_PADDING,
      left: PNG_PADDING,
      right: PNG_PADDING,
      background: THEMES.light.background
    })
    .png({ palette: true, compressionLevel: 9 })
    .toBuffer();
}

async function renderAll({
  renders,
  written
}: {
  renders: Render[];
  written: Set<string>;
}): Promise<void> {
  await using browser = await launchBrowser("render-mermaid", {
    protocolTimeout: PROTOCOL_TIMEOUT_MS
  });
  const queue = renders.values();
  const worker = async () => {
    for (const { job, variant, path } of queue) {
      const file =
        variant.kind === "svg"
          ? await renderSvg({ browser, job, theme: variant.theme })
          : await renderPng({ browser, job });
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, file);
      written.add(path);
      console.log(
        `rendered ${rel(path)}  (${rel(job.post)} diagram ${job.index + 1}, ${variantLabel(variant)})`
      );
    }
  };
  await Promise.all(Array.from({ length: RENDER_WORKERS }, worker));
}

async function main(): Promise<void> {
  const posts = globSync("**/index.md", { cwd: CONTENT_DIR })
    .sort()
    .map(file => {
      const path = join(CONTENT_DIR, file);
      return { path, markdown: readFileSync(path, "utf8") };
    });
  const { jobs, expected } = await diagramJobs(posts);
  const stale = orphans({ expected, listDir: dir => (existsSync(dir) ? readdirSync(dir) : []) });
  const missing = pendingRenders({ jobs, force, isCurrent, exists: existsSync });

  for (const path of stale) {
    rmSync(path);
    console.log(`removed  ${rel(path)}`);
  }
  for (const [postDir] of expected) {
    const dir = join(postDir, DIAGRAMS_DIR);
    if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
  }

  if (missing.length === 0) {
    console.log(`render-mermaid: ${jobs.length} diagrams up to date`);
    return;
  }

  await retryRenders({ renders: missing, attempts: RENDER_ATTEMPTS, run: renderAll });
  console.log(`render-mermaid: ${missing.length} files written for ${jobs.length} diagrams`);
}

await main();
