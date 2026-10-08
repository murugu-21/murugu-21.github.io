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
import { parseArgs } from "node:util";
import { renderMermaid } from "@mermaid-js/mermaid-cli";
import type { Browser } from "puppeteer";
import sharp from "sharp";
import subsetFont from "subset-font";
import { z } from "zod";

import { jsonString } from "#utils/json.ts";
import { FIRA_CODE_FEATURES, FIRA_CODE_VF } from "./fira-code-subset.ts";
import { launchBrowser } from "./launch-browser.ts";
import { ROOT } from "./site-dir.ts";
import { DIAGRAMS_DIR, type DiagramTheme } from "#src/lib/blog/mermaid-diagrams.ts";
import { type Job, diagramJobs, orphans, pendingRenders, variantLabel } from "./diagram-plan.ts";
import {
  THEMES,
  cssUrl,
  finishSvg,
  fontFace,
  renderOptions,
  stampOf,
  usedText
} from "./mermaid-svg.ts";

// Renders every ```mermaid fence under content/blog to
// <slug>/diagrams/<hash>.<theme>.svg plus a light <hash>.png for RSS (feed
// mirrors can't draw the SVGs), and prunes orphans. The output is gitignored:
// `astro build` runs this first, and remark-mermaid.ts runs it when a fence has
// no rendering (an edited diagram in `astro dev`).
//
//   bun run diagrams           render what is missing or rendered by another
//                              mermaid version, prune orphans
//   bun run diagrams --force   re-render everything
//
// An SVG in <img> can't reach page fonts, so each embeds a Fira Code subset;
// otherwise a substitute face's widths make labels overrun their boxes.

const CONTENT_DIR = join(ROOT, "content/blog");
// mermaid-cli's own mermaid; nothing else installs another copy.
const MERMAID_VERSION = jsonString(z.object({ version: z.string() })).parse(
  readFileSync(join(ROOT, "node_modules/mermaid/package.json"), "utf8")
).version;
// The full font: each SVG embeds its own subset, so no latin cut is needed here.
const FONT = readFileSync(FIRA_CODE_VF);
// The page measures labels in exactly the face the SVG embeds a subset of.
const PAGE_FONT = cssUrl(fontFace(FONT));

// A file stamped with another mermaid version counts as missing, so a local
// copy re-renders after an upgrade.
const STAMP = `mermaid@${MERMAID_VERSION}`;
const isCurrent = (path: string) =>
  existsSync(path) && stampOf(readFileSync(path, "utf8")) === STAMP;

const RENDER_WORKERS = 4;
// 2x for high-density screens; wider than any diagram so none is scaled down
const PNG_VIEWPORT = { width: 4000, height: 900, deviceScaleFactor: 2 };
// mermaid-cli shrinks the viewport to the diagram's right edge, ignoring the
// body's right margin, so the 100%-wide SVG would draw that much narrower.
const NO_BODY_MARGIN = cssUrl("body{margin:0}");
// Matches the 12px card that remark-mermaid.ts puts the <img> on, doubled for the 2x scale.
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

// Palette-quantized, since line art compresses far smaller with no visible loss.
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

  await using browser = await launchBrowser("render-mermaid");
  // Each render opens its own page, so a few workers share one queue.
  const queue = missing.values();
  const worker = async () => {
    for (const { job, variant, path } of queue) {
      const file =
        variant.kind === "svg"
          ? await renderSvg({ browser, job, theme: variant.theme })
          : await renderPng({ browser, job });
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, file);
      console.log(
        `rendered ${rel(path)}  (${rel(job.post)} diagram ${job.index + 1}, ${variantLabel(variant)})`
      );
    }
  };
  await Promise.all(Array.from({ length: RENDER_WORKERS }, worker));
  console.log(`render-mermaid: ${missing.length} files written for ${jobs.length} diagrams`);
}

await main();
