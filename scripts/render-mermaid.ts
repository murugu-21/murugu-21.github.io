import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser, type Page } from "puppeteer";
import sharp from "sharp";
import subsetFont from "subset-font";

import {
  DIAGRAMS_DIR,
  diagramFile,
  diagramHash,
  diagramRaster,
  findMermaidFences,
  type DiagramTheme
} from "../src/blog/utils/mermaid-diagrams";

// Renders every ```mermaid fence under content/blog to SVG, one file per
// theme, next to its post (content/blog/<slug>/diagrams/<hash>.<theme>.svg),
// plus a 2x PNG of the light theme for the RSS feed (<hash>.png — mirrors
// rasterize images server-side and cannot draw the SVGs, see diagramRaster),
// and deletes renderings no fence refers to any more. The build never runs
// mermaid: src/blog/utils/remark-mermaid.ts swaps each fence for these files
// and fails when one is missing, so this is a dev-time step — run it after
// editing a diagram and commit the output.
//
//   bun run diagrams           render what is missing or rendered by another
//                              mermaid version, prune orphans
//   bun run diagrams --force   re-render everything
//   bun run diagrams --check   report missing/stale/orphaned files, exit 1 if any
//
// Headless Chromium (puppeteer, already a dev dependency for the resume PDF)
// runs the same mermaid the page used to ship, with the page's Fira Code
// loaded so labels are measured in the face they are shown in. An SVG shown
// through <img> cannot reach the page's fonts, so each file embeds a subset of
// that font (only the glyphs the diagram uses, a few KB) as a data: URI —
// without it the browser substitutes a system monospace with different
// advance widths and labels overrun their boxes. The theme background is
// baked in too, so the zoomed copy keeps a card behind edge labels.

const CONTENT_DIR = fileURLToPath(new URL("../content/blog/", import.meta.url));
const MERMAID_JS = fileURLToPath(
  new URL("../node_modules/mermaid/dist/mermaid.min.js", import.meta.url)
);
const MERMAID_VERSION: string = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../node_modules/mermaid/package.json", import.meta.url)),
    "utf8"
  )
).version;
const FONT_FILE = fileURLToPath(
  new URL(
    "../node_modules/@fontsource-variable/fira-code/files/fira-code-latin-wght-normal.woff2",
    import.meta.url
  )
);
const FONT_FAMILY = "Fira Code, ui-monospace, monospace";

// Stamped on every <svg> root. A file whose stamp differs from the mermaid
// installed now is treated as missing, so a mermaid upgrade re-renders on the
// next run and `--check` reports it, without anyone remembering to bump
// RENDERER_VERSION (that one is for changes to this script's own output).
const STAMP_ATTR = "data-renderer";
const STAMP = `mermaid@${MERMAID_VERSION}`;
const stampOf = (path: string): string | undefined =>
  readFileSync(path, "utf8")
    .slice(0, 2048)
    .match(new RegExp(`\\b${STAMP_ATTR}="([^"]*)"`))?.[1];
const upToDate = (path: string) => existsSync(path) && stampOf(path) === STAMP;

// One output file of one diagram. The PNG is a screenshot of the light SVG,
// so it is current exactly when that SVG is (a PNG cannot carry the stamp).
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
// PNG padding, matching the card post.css draws around the page's <img>.
const PNG_PADDING = 12;

// Per theme: mermaid's theme name and the card colour behind the diagram
// (post.css paints the same colour behind the <img>'s padding; the dark one
// is --color-dark-bg).
const THEMES: Record<DiagramTheme, { mermaid: string; background: string }> = {
  light: { mermaid: "neutral", background: "#fff" },
  dark: { mermaid: "dark", background: "#282c35" }
};

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const check = args.has("--check");

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

// Every file a post's fences expect, keyed by post directory.
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

// The glyphs a rendering needs: the text between tags, once mermaid's inline
// stylesheet is out of the way (its selectors would drag the whole CSS
// character repertoire into the subset). A small superset of the visible
// labels is fine — the subset only grows by a few glyphs.
function usedText(svg: string): string {
  const text = svg
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
  return [...new Set(text)].join("");
}

async function embedStyle(svg: string, theme: DiagramTheme, font: Buffer): Promise<string> {
  const subset = await subsetFont(font, usedText(svg), { targetFormat: "woff2" });
  const face =
    `@font-face{font-family:"Fira Code";font-style:normal;font-weight:300 700;` +
    `src:url(data:font/woff2;base64,${subset.toString("base64")}) format("woff2-variations")}`;
  return svg
    .replace(/<svg\b/, `<svg ${STAMP_ATTR}="${STAMP}"`)
    .replace(
      /<svg\b[^>]*>/,
      open => `${open}<style>${face}svg{background:${THEMES[theme].background}}</style>`
    );
}

async function openRenderer(font: Buffer): Promise<{ browser: Browser; page: Page }> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  // 2x so the PNG stays sharp on high-density screens; the viewport is
  // widened per screenshot for diagrams wider than this.
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
  page.on("pageerror", err => console.error("[render-mermaid] page error:", err));
  // The full font goes into the measuring page so every glyph measures in the
  // face the SVG will embed.
  await page.setContent(
    `<!doctype html><html><head><style>@font-face{font-family:"Fira Code";font-style:normal;font-weight:300 700;` +
      `src:url(data:font/woff2;base64,${font.toString("base64")}) format("woff2-variations")}</style></head><body></body></html>`
  );
  await page.addScriptTag({ content: readFileSync(MERMAID_JS, "utf8") });
  await page.evaluate(async () => {
    await document.fonts.load('16px "Fira Code"');
    await document.fonts.ready;
  });
  return { browser, page };
}

// The element id lands in the SVG (`<svg id>` and every selector of mermaid's
// inline stylesheet), so it is derived from the file name rather than a
// counter: a `--force` re-render then only changes the files whose picture
// changed, and the diff stays reviewable. Each SVG is its own document inside
// an <img>, so ids need not be unique across files.
async function renderOne(
  page: Page,
  source: string,
  theme: DiagramTheme,
  hash: string
): Promise<string> {
  return page.evaluate(
    async (src, themeName, fontFamily, svgId) => {
      // `mermaid` is the UMD global the script tag installed. "strict" is
      // mermaid's default: no click callbacks, labels HTML-escaped. Nothing
      // the posts use needs more, and the files are also reachable directly
      // under /static/.
      const m = (window as unknown as { mermaid: typeof import("mermaid").default }).mermaid;
      m.initialize({ startOnLoad: false, theme: themeName, securityLevel: "strict", fontFamily });
      const { svg } = await m.render(svgId, src);
      return svg;
    },
    source,
    THEMES[theme].mermaid as "neutral" | "dark",
    FONT_FAMILY,
    `m-${hash}-${theme}`
  );
}

// Screenshot of the styled light SVG at its natural size, on the same white
// card the page draws, quantized to a palette (line art compresses to a
// fraction of a truecolour PNG with no visible loss).
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
  await page.evaluate(padding => {
    (document.getElementById("shot") as HTMLElement).style.padding = `${padding}px`;
  }, PNG_PADDING);
  await page.evaluate(() => document.fonts.ready);
  const card = await page.$("#shot");
  if (!card) throw new Error("rasterize: card element missing");
  const shot = await card.screenshot({ type: "png" });
  await page.evaluate(() => {
    document.body.innerHTML = "";
  });
  return sharp(shot).png({ palette: true, compressionLevel: 9 }).toBuffer();
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

  if (check) {
    for (const { path } of missing) {
      console.log(`${existsSync(path) ? "stale   " : "missing "} ${rel(path)}`);
    }
    for (const path of stale) console.log(`orphaned ${rel(path)}`);
    if (missing.length || stale.length) {
      console.error(
        `render-mermaid: ${missing.length} missing, ${stale.length} orphaned — run \`bun run diagrams\``
      );
      process.exit(1);
    }
    console.log(`render-mermaid: ${jobs.length} diagrams up to date`);
    return;
  }

  for (const path of stale) {
    rmSync(path);
    console.log(`removed  ${rel(path)}`);
  }
  // A post whose last diagram went away leaves an empty directory behind.
  for (const [postDir] of expected) {
    const dir = join(postDir, DIAGRAMS_DIR);
    if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
  }

  if (missing.length === 0) {
    console.log(`render-mermaid: ${jobs.length} diagrams up to date`);
    return;
  }

  const font = readFileSync(FONT_FILE);
  const { browser, page } = await openRenderer(font);
  try {
    // Styled light SVGs rendered this run, so the PNG (listed after the SVGs
    // for the same job) reuses the exact markup just written.
    const lightSvgs = new Map<string, string>();
    for (const { job, variant, path } of missing) {
      mkdirSync(dirname(path), { recursive: true });
      if (variant.kind === "svg") {
        const svg = await renderOne(page, job.source, variant.theme, job.hash);
        const styled = await embedStyle(svg, variant.theme, font);
        if (variant.theme === "light") lightSvgs.set(job.hash, styled);
        writeFileSync(path, styled);
      } else {
        const styled =
          lightSvgs.get(job.hash) ?? readFileSync(variantPath(job, VARIANTS[0]), "utf8");
        writeFileSync(path, await rasterize(page, styled));
      }
      console.log(
        `rendered ${rel(path)}  (${rel(job.post)} diagram ${job.index + 1}, ${variantLabel(variant)})`
      );
    }
  } finally {
    await browser.close();
  }
  console.log(`render-mermaid: ${missing.length} files written for ${jobs.length} diagrams`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
