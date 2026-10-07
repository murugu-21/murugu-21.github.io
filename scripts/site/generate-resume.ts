import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preview } from "astro";
import { PDFParse } from "pdf-parse";

import { launchBrowser } from "./launch-browser.ts";
import { checkResume } from "./resume-gate.ts";
import { ROOT, SITE_DIR } from "./site-dir.ts";

// Prints /resume to resume.pdf in the built site. Runs last from astro.config.ts,
// so preview serves the final build. Arg: the dir to write resume.pdf into
// (default SITE_DIR).
// Runs on Node, because astro preview hangs under Bun (README).

const DIST_DIR = resolve(process.argv[2] ?? SITE_DIR);
const OUT_PATH = join(DIST_DIR, "resume.pdf");
// Fixed, because the Cloudflare adapter's preview ignores strictPort and reports
// the requested port even after falling back to another. Avoids dev and preview
// on 4321/4322.
const PREVIEW_PORT = 4398;

// A separate function, so the server and browser close before the gate reads the PDF.
async function printResume(): Promise<void> {
  const server = await preview({
    root: ROOT,
    logLevel: "warn",
    server: { port: PREVIEW_PORT }
  });
  try {
    await using browser = await launchBrowser("generate-resume");
    const page = await browser.newPage();
    await page.goto(`http://localhost:${PREVIEW_PORT}/resume/`, { waitUntil: "networkidle0" });
    // wait for the webfont, or the PDF gets fallback metrics and line breaks
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: OUT_PATH,
      format: "Letter",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });
  } finally {
    await server.stop();
  }
}

await printResume();

const buffer = await readFile(OUT_PATH);
const parser = new PDFParse({ data: buffer });
const { text } = await parser.getText();
const info = await parser.getInfo().catch(() => null);
await parser.destroy();

console.log(
  checkResume({ path: OUT_PATH, bytes: buffer.length, text, pageCount: info?.total ?? null })
);
