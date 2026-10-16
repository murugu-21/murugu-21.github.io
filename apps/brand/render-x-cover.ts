import { join } from "node:path";
import { pathToFileURL } from "node:url";

import puppeteer from "puppeteer";

const SOURCE = join(import.meta.dirname, "x-cover.html");
const THEMES = ["dark", "light"] as const;
const SCALES = [
  { deviceScaleFactor: 1, suffix: "" },
  { deviceScaleFactor: 2, suffix: "@2x" }
] as const;

await using browser = await puppeteer.launch();
const page = await browser.newPage();
for (const theme of THEMES) {
  for (const { deviceScaleFactor, suffix } of SCALES) {
    await page.setViewport({ width: 1500, height: 500, deviceScaleFactor });
    await page.goto(`${pathToFileURL(SOURCE).href}?theme=${theme}`, {
      waitUntil: "networkidle0"
    });
    await page.evaluate(() => document.fonts.ready);
    const out = join(import.meta.dirname, `x-cover-${theme}${suffix}.png`);
    await page.screenshot({ path: out });
    console.log(out);
  }
}
