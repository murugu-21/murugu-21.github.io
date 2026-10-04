import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { parseArgs } from "node:util";
import type { Browser, Page } from "puppeteer";
import sharp from "sharp";
import subsetFont from "subset-font";
import { z } from "zod";

import { jsonString } from "@worker/json.ts";
import { launchBrowser } from "./launch-browser.ts";
import {
  DIAGRAMS_DIR,
  diagramFile,
  diagramHash,
  diagramRaster,
  findMermaidFences,
  type DiagramTheme
} from "../src/blog/utils/mermaid-diagrams";

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
// otherwise a substitute face's widths make labels overrun their boxes. The
// theme background is baked in so the zoomed copy keeps a card behind labels.

// Set by the mermaid bundle that renderOne's page loads.
declare global {
  interface Window {
    mermaid?: typeof import("mermaid").default;
  }
}

const ROOT = join(import.meta.dirname, "..");
const CONTENT_DIR = join(ROOT, "content/blog");
const MERMAID_DIR = join(ROOT, "node_modules/mermaid");
const MERMAID_JS = join(MERMAID_DIR, "dist/mermaid.min.js");
const MERMAID_VERSION = jsonString(z.object({ version: z.string() })).parse(
  readFileSync(join(MERMAID_DIR, "package.json"), "utf8")
).version;
const FONT_FILE = join(
  ROOT,
  "node_modules/@fontsource-variable/fira-code/files/fira-code-latin-wght-normal.woff2"
);
const FONT_FAMILY = "Fira Code, ui-monospace, monospace";

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
// matches the card post.css draws around the <img>
const PNG_PADDING = 12;

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

const fontFace = (woff2: Buffer) =>
  `@font-face{font-family:"Fira Code";font-style:normal;font-weight:300 700;` +
  `src:url(data:font/woff2;base64,${woff2.toString("base64")}) format("woff2-variations")}`;

async function embedStyle(svg: string, theme: DiagramTheme, font: Buffer): Promise<string> {
  const face = fontFace(await subsetFont(font, usedText(svg), { targetFormat: "woff2" }));
  return svg
    .replace(/<svg\b/, `<svg ${STAMP_ATTR}="${STAMP}"`)
    .replace(
      /<svg\b[^>]*>/,
      open => `${open}<style>${face}svg{background:${THEMES[theme].background}}</style>`
    );
}

async function openRenderer(browser: Browser, font: Buffer): Promise<Page> {
  const page = await browser.newPage();
  // 2x for high-density screens; widened per screenshot when needed
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
  page.on("pageerror", err => console.error("[render-mermaid] page error:", err));
  // full font, so every glyph measures in the face the SVG embeds
  await page.setContent(
    `<!doctype html><html><head><style>${fontFace(font)}</style></head><body></body></html>`
  );
  await page.addScriptTag({ content: readFileSync(MERMAID_JS, "utf8") });
  await page.evaluate(async () => {
    await document.fonts.load('16px "Fira Code"');
    await document.fonts.ready;
  });
  return page;
}

// The id lands in the SVG and its stylesheet, so it derives from the hash (not
// a counter) to keep re-renders byte-identical. Ids needn't be unique across files.
async function renderOne({
  page,
  source,
  theme,
  hash
}: {
  page: Page;
  source: string;
  theme: DiagramTheme;
  hash: string;
}): Promise<string> {
  return page.evaluate(
    async ({ src, themeName, fontFamily, svgId }) => {
      // "strict" means no click callbacks and escaped labels; the files are also served directly.
      const m = window.mermaid;
      if (!m) throw new Error("mermaid did not load in the page");
      m.initialize({ startOnLoad: false, theme: themeName, securityLevel: "strict", fontFamily });
      const { svg } = await m.render(svgId, src);
      // mermaid emits HTML (bare `<br>` in labels); <img> parses as XML and
      // breaks on it, so re-serialize as XML.
      const template = document.createElement("template");
      template.innerHTML = svg;
      const root = template.content.querySelector("svg");
      if (!root) throw new Error("renderOne: mermaid returned no <svg>");
      return new XMLSerializer().serializeToString(root);
    },
    {
      src: source,
      themeName: THEMES[theme].mermaid,
      fontFamily: FONT_FAMILY,
      svgId: `m-${hash}-${theme}`
    }
  );
}

// <img> draws nothing for malformed XML, so never write one.
async function assertWellFormed(page: Page, svg: string, path: string): Promise<void> {
  const error = await page.evaluate(
    markup =>
      new DOMParser().parseFromString(markup, "image/svg+xml").querySelector("parsererror")
        ?.textContent ?? null,
    svg
  );
  if (error) throw new Error(`render-mermaid: ${rel(path)} is not well-formed XML: ${error}`);
}

// Palette-quantized, since line art compresses far smaller with no visible loss.
async function rasterize(page: Page, styledSvg: string): Promise<Buffer> {
  const size = await page.evaluate(svgMarkup => {
    document.body.innerHTML = `<div id="shot" style="display:inline-block;background:#fff">${svgMarkup}</div>`;
    const svg = document.querySelector<SVGSVGElement>("#shot svg");
    if (!svg) throw new Error("rasterize: no <svg> in the rendering");
    const [, , width, height] = (svg.getAttribute("viewBox") || "").split(/\s+/).map(Number);
    if (!(width > 0 && height > 0)) throw new Error("rasterize: rendering has no viewBox");
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.style.maxWidth = "none";
    return { width, height };
  }, styledSvg);
  await page.setViewport({
    width: Math.ceil(size.width) + 2 * PNG_PADDING + 40,
    height: Math.ceil(size.height) + 2 * PNG_PADDING + 40,
    deviceScaleFactor: 2
  });
  const card = await page.$("div#shot");
  if (!card) throw new Error("rasterize: card element missing");
  await card.evaluate((el, padding) => {
    el.style.padding = `${padding}px`;
  }, PNG_PADDING);
  await page.evaluate(() => document.fonts.ready);
  const shot = await card.screenshot({ type: "png" });
  await page.evaluate(() => {
    document.body.innerHTML = "";
  });
  return sharp(shot).png({ palette: true, compressionLevel: 9 }).toBuffer();
}

type Target = { job: Job; variant: Variant; path: string };

async function renderMissing({
  page,
  font,
  missing
}: {
  page: Page;
  font: Buffer;
  missing: Target[];
}): Promise<void> {
  // the PNG (listed after its SVGs) reuses the light markup just written
  const lightSvgs = new Map<string, string>();
  for (const { job, variant, path } of missing) {
    mkdirSync(dirname(path), { recursive: true });
    if (variant.kind === "svg") {
      const svg = await renderOne({
        page,
        source: job.source,
        theme: variant.theme,
        hash: job.hash
      });
      const styled = await embedStyle(svg, variant.theme, font);
      await assertWellFormed(page, styled, path);
      if (variant.theme === "light") lightSvgs.set(job.hash, styled);
      writeFileSync(path, styled);
    } else {
      const styled = lightSvgs.get(job.hash) ?? readFileSync(variantPath(job, VARIANTS[0]), "utf8");
      writeFileSync(path, await rasterize(page, styled));
    }
    console.log(
      `rendered ${rel(path)}  (${rel(job.post)} diagram ${job.index + 1}, ${variantLabel(variant)})`
    );
  }
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

  const font = readFileSync(FONT_FILE);
  await using browser = await launchBrowser("render-mermaid");
  const page = await openRenderer(browser, font);
  await renderMissing({ page, font, missing });
  console.log(`render-mermaid: ${missing.length} files written for ${jobs.length} diagrams`);
}

await main();
