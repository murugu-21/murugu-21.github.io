import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { renderMermaid, type ParseMDDOptions } from "@mermaid-js/mermaid-cli";
import type { Browser } from "puppeteer";
import sharp from "sharp";
import subsetFont from "subset-font";
import { z } from "zod";

import { jsonString } from "#utils/json.ts";
import { launchBrowser } from "./launch-browser.ts";
import { ROOT } from "./site-dir.ts";
import {
  DIAGRAMS_DIR,
  diagramFile,
  diagramHash,
  diagramRaster,
  findMermaidFences,
  type DiagramTheme
} from "#src/blog/utils/mermaid-diagrams.ts";

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
const FONT = readFileSync(
  fileURLToPath(
    import.meta.resolve("@fontsource-variable/fira-code/files/fira-code-latin-wght-normal.woff2")
  )
);
const fontFace = (woff2: Buffer) =>
  `@font-face{font-family:"Fira Code";font-style:normal;font-weight:300 700;` +
  `src:url(data:font/woff2;base64,${woff2.toString("base64")}) format("woff2-variations")}`;
const cssUrl = (css: string) => new URL(`data:text/css,${encodeURIComponent(css)}`);
// The page measures labels in exactly the face the SVG embeds a subset of.
const PAGE_FONT = cssUrl(fontFace(FONT));

// A file stamped with another mermaid version counts as missing, so a local
// copy re-renders after an upgrade.
const STAMP_ATTR = "data-renderer";
const STAMP = `mermaid@${MERMAID_VERSION}`;
const stampOf = (path: string): string | undefined =>
  readFileSync(path, "utf8")
    .slice(0, 2048)
    .match(new RegExp(`\\b${STAMP_ATTR}="([^"]*)"`))?.[1];
const upToDate = (path: string) => existsSync(path) && stampOf(path) === STAMP;

// The PNG can't carry the stamp; it is current exactly when the light SVG is.
type Variant = { kind: "svg"; theme: DiagramTheme } | { kind: "png" };
const VARIANTS: readonly Variant[] = [
  { kind: "svg", theme: "light" },
  { kind: "svg", theme: "dark" },
  { kind: "png" }
];
const variantPath = (job: Job, variant: Variant) =>
  join(
    dirname(job.post),
    variant.kind === "png" ? diagramRaster(job.hash) : diagramFile(job.hash, variant.theme)
  );
const variantLabel = (variant: Variant) => (variant.kind === "png" ? "png" : variant.theme);
const RENDER_WORKERS = 4;
// 2x for high-density screens; wider than any diagram so none is scaled down
const PNG_VIEWPORT = { width: 4000, height: 900, deviceScaleFactor: 2 };
// mermaid-cli shrinks the viewport to the diagram's right edge, ignoring the
// body's right margin, so the 100%-wide SVG would draw that much narrower.
const NO_BODY_MARGIN = cssUrl("body{margin:0}");
// the 12px card post.css draws around the <img>, at 2x
const PNG_PADDING = 24;

// background matches post.css's card (dark is --color-dark-bg)
const THEMES: Record<DiagramTheme, { mermaid: "neutral" | "dark"; background: string }> = {
  light: { mermaid: "neutral", background: "#fff" },
  dark: { mermaid: "dark", background: "#282c35" }
};

const { values: options } = parseArgs({ options: { force: { type: "boolean" } } });
const force = options.force ?? false;

interface Job {
  post: string; // path of index.md
  index: number;
  source: string;
  hash: string;
}

function findPosts(dir: string): string[] {
  const posts: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) posts.push(...findPosts(path));
    else if (entry.name === "index.md") posts.push(path);
  }
  return posts.sort();
}

// Keyed by post directory.
async function expectedFiles(): Promise<{ jobs: Job[]; expected: Map<string, Set<string>> }> {
  const jobs: Job[] = [];
  const expected = new Map<string, Set<string>>();
  for (const post of findPosts(CONTENT_DIR)) {
    const fences = findMermaidFences(readFileSync(post, "utf8"));
    const files = new Set<string>();
    for (const [index, fence] of fences.entries()) {
      const hash = await diagramHash(fence.source);
      const job: Job = { post, index, source: fence.source, hash };
      jobs.push(job);
      for (const variant of VARIANTS) files.add(variantPath(job, variant));
    }
    expected.set(dirname(post), files);
  }
  return { jobs, expected };
}

function orphans(expected: Map<string, Set<string>>): string[] {
  const out: string[] = [];
  for (const [postDir, files] of expected) {
    const dir = join(postDir, DIAGRAMS_DIR);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (!files.has(path)) out.push(path);
    }
  }
  return out;
}

const rel = (path: string) => relative(process.cwd(), path);

// Text between tags, minus the inline stylesheet (whose selectors would bloat
// the subset). A small superset of the labels is fine.
function usedText(svg: string): string {
  const text = svg
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
  return [...new Set(text)].join("");
}

const renderOptions = (job: Job, theme: DiagramTheme) =>
  ({
    backgroundColor: THEMES[theme].background,
    // "strict" means no click callbacks and escaped labels; the files are also served directly.
    mermaidConfig: {
      theme: THEMES[theme].mermaid,
      securityLevel: "strict",
      fontFamily: "Fira Code, ui-monospace, monospace"
    },
    customFontCSS: [{ cssUrl: PAGE_FONT }],
    // The id lands in the SVG and its stylesheet, so it derives from the hash (not
    // a counter) to keep re-renders byte-identical. Ids needn't be unique across files.
    svgId: `m-${job.hash}-${theme}`
  }) satisfies ParseMDDOptions;

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
    ...renderOptions(job, theme),
    // mermaid-cli's own embedding would inline every Unicode range whole
    fontEmbed: false
  });
  const svg = Buffer.from(data).toString("utf8");
  const subset = await subsetFont(FONT, usedText(svg), {
    targetFormat: "woff2"
  });
  return svg
    .replace(/<svg\b/, `<svg ${STAMP_ATTR}="${STAMP}"`)
    .replace(/<svg\b[^>]*>/, open => `${open}<style>${fontFace(subset)}</style>`);
}

// Palette-quantized, since line art compresses far smaller with no visible loss.
async function renderPng({ browser, job }: { browser: Browser; job: Job }): Promise<Buffer> {
  const { data } = await renderMermaid(browser, job.source, "png", {
    ...renderOptions(job, "light"),
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
  const { jobs, expected } = await expectedFiles();
  const stale = orphans(expected);
  const missing = jobs.flatMap(job => {
    const lightStale = force || !upToDate(variantPath(job, VARIANTS[0]));
    return VARIANTS.map(variant => ({ job, variant, path: variantPath(job, variant) })).filter(
      ({ variant, path }) =>
        force || (variant.kind === "png" ? lightStale || !existsSync(path) : !upToDate(path))
    );
  });

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
