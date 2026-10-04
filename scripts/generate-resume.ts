import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { PDFParse } from "pdf-parse";

import { launchBrowser } from "./launch-browser.ts";
import { SITE_DIR } from "./site-dir.ts";

// Prints /resume to resume.pdf in the built site. Runs last from astro.config.ts
// so it serves exactly what ships. Arg: the built site dir (default SITE_DIR).

const DIST_DIR = resolve(process.argv[2] ?? SITE_DIR) + "/";
const OUT_PATH = join(DIST_DIR, "resume.pdf");

const MIME_TYPES: Record<string, string> = {
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

/** Static server over the built site; a request for foo/ serves foo/index.html. */
function createStaticServer(rootDir: string): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
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
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": stats.size
      });
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
}

// ATS gate. The build fails unless each token is in the PDF's extracted text.
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

// Its own scope, so the server and browser close before the PDF is parsed.
async function printResume(): Promise<void> {
  await using server = createStaticServer(DIST_DIR);
  await listen(server, 0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("static server has no port");

  await using browser = await launchBrowser("generate-resume");
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/resume/`, { waitUntil: "networkidle0" });
  // wait for the webfont, or the PDF gets fallback metrics and line breaks
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: OUT_PATH,
    format: "Letter",
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });
}

await printResume();

const buffer = await readFile(OUT_PATH);
const parser = new PDFParse({ data: buffer });
const { text } = await parser.getText();
const info = await parser.getInfo().catch(() => null);
await parser.destroy();

const missing = ATS_REQUIRED_TOKENS.filter(token => !text.includes(token));
if (missing.length > 0) {
  throw new Error(
    `ATS gate FAILED: missing tokens ${missing.map(t => JSON.stringify(t)).join(", ")}`
  );
}
const pageCount = info?.total ?? null;
// @sparticuz's fallback fonts are wider than local Chrome's, so overflow can be CI-only.
if (pageCount !== null && pageCount > MAX_PAGES) {
  throw new Error(`page gate FAILED: ${pageCount} pages (max ${MAX_PAGES})`);
}
console.log(
  `[generate-resume] wrote ${OUT_PATH} (${(buffer.length / 1024).toFixed(1)} KB, ${pageCount ?? "?"} page${pageCount === 1 ? "" : "s"}); ` +
    `ATS gate passed, all ${ATS_REQUIRED_TOKENS.length} required tokens found`
);
