import {createServer} from "node:http";
import {readFile, stat} from "node:fs/promises";
import {createReadStream} from "node:fs";
import {extname, join, normalize} from "node:path";
import puppeteer from "puppeteer";
import {PDFParse} from "pdf-parse";

// Renders /resume as a PDF with headless Chromium and writes it to
// dist/resume.pdf. Runs as the last step of `build:site`, after dist/ is
// final (blog merged in, sitemap/llms merged) so the static server below
// serves exactly what ships to production.

const DIST_DIR = new URL("../dist/", import.meta.url).pathname;
const OUT_PATH = new URL("../dist/resume.pdf", import.meta.url).pathname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf"
};

/** Minimal static file server over dist/, directory-index aware (foo/ -> foo/index.html). */
function createStaticServer(rootDir) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const filePath = normalize(join(rootDir, pathname));
      if (!filePath.startsWith(normalize(rootDir))) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      const stats = await stat(filePath);
      if (stats.isDirectory()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const contentType = MIME_TYPES[extname(filePath)] ?? "application/octet-stream";
      res.writeHead(200, {"Content-Type": contentType, "Content-Length": stats.size});
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
}

// ATS text-extraction gate: every one of these must be present verbatim in
// the text extracted from the printed PDF, or the build fails.
const MAX_PAGES = 2;

const ATS_REQUIRED_TOKENS = [
  "Murugappan M",
  "murugu2001@gmail.com",
  "PROFESSIONAL SUMMARY",
  "SKILLS",
  "EXPERIENCE",
  "EDUCATION",
  "Software Engineer II",
  "95%+",
  "$300k"
];

let server;
let browser;
try {
  server = createStaticServer(DIST_DIR);
  await listen(server, 0);
  const {port} = server.address();
  const url = `http://127.0.0.1:${port}/resume/`;

  // --no-sandbox: CI runners (GitHub ubuntu-24.04 AppArmor, container builds)
  // block Chrome's sandbox; safe here since we only render our own local page.
  const launchArgs = ["--no-sandbox", "--disable-setuid-sandbox"];
  try {
    browser = await puppeteer.launch({headless: true, args: launchArgs});
  } catch (err) {
    // Cloudflare Workers Builds' image lacks Chrome's shared system libraries
    // (libatk etc.), so puppeteer's own Chrome cannot start there. Fall back
    // to @sparticuz/chromium — a self-contained build with everything bundled.
    console.warn(
      `[generate-resume] system chrome failed (${err.message.split("\n")[0]}); ` +
        "falling back to @sparticuz/chromium"
    );
    const {default: chromium} = await import("@sparticuz/chromium");
    browser = await puppeteer.launch({
      headless: true,
      executablePath: await chromium.executablePath(),
      args: [...chromium.args, ...launchArgs]
    });
  }
  const page = await browser.newPage();
  await page.goto(url, {waitUntil: "networkidle0"});
  await page.pdf({
    path: OUT_PATH,
    format: "Letter",
    printBackground: true,
    margin: {top: 0, right: 0, bottom: 0, left: 0}
  });

  const {size} = await stat(OUT_PATH);
  const buffer = await readFile(OUT_PATH);
  const parser = new PDFParse({data: buffer});
  const {text} = await parser.getText();
  const info = await parser.getInfo().catch(() => null);
  await parser.destroy();

  const missing = ATS_REQUIRED_TOKENS.filter(token => !text.includes(token));
  const pageCount = info?.total ?? info?.numpages ?? null;
  if (missing.length > 0) {
    console.error(
      `[generate-resume] ATS gate FAILED — missing tokens: ${missing.map(t => JSON.stringify(t)).join(", ")}`
    );
    process.exitCode = 1;
  } else if (typeof pageCount === "number" && pageCount > MAX_PAGES) {
    // The CF build image's chromium (@sparticuz) uses wider fallback fonts
    // than local Chrome, so overflow can be environment-specific — fail the
    // build rather than silently shipping a 3-page resume.
    console.error(
      `[generate-resume] page gate FAILED — ${pageCount} pages (max ${MAX_PAGES})`
    );
    process.exitCode = 1;
  } else {
    console.log(
      `[generate-resume] wrote ${OUT_PATH} (${(size / 1024).toFixed(1)} KB, ${pageCount ?? "unknown"} page${pageCount === 1 ? "" : "s"})`
    );
    console.log(
      `[generate-resume] ATS gate passed — all ${ATS_REQUIRED_TOKENS.length} required tokens found; ${pageCount ?? "?"} page${pageCount === 1 ? "" : "s"} (max ${MAX_PAGES})`
    );
  }
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}

if (process.exitCode) process.exit(process.exitCode);
