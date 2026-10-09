import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preview } from "astro";
import { PDFParse } from "pdf-parse";

import { launchBrowser } from "./launch-browser.ts";
import { ATS_REQUIRED_TOKENS, resumeProblems } from "./resume-gate.ts";
import { ROOT, SITE_DIR } from "./site-dir.ts";

// Prints /resume to resume.pdf in the built site. Runs last from astro.config.ts,
// so preview serves the final build. Arg: the dir to write resume.pdf into
// (default SITE_DIR).

const DIST_DIR = resolve(process.argv[2] ?? SITE_DIR);
const OUT_PATH = join(DIST_DIR, "resume.pdf");
// Fixed, clear of dev (4399) and preview (8787).
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
const { text, total: pageCount } = await parser.getText();
await parser.destroy();

const problems = resumeProblems({ text, pageCount });
if (problems.length > 0) throw new Error(problems.join("\n"));
console.log(
  `[generate-resume] wrote ${OUT_PATH} (${(buffer.length / 1024).toFixed(1)} KB, ${pageCount} page${pageCount === 1 ? "" : "s"}); ` +
    `ATS gate passed, all ${ATS_REQUIRED_TOKENS.length} required tokens found`
);
