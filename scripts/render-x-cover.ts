// Renders the X profile banners from brand/x-cover.html: both themes, at 1x
// (1500x500 — X's recommended banner size) and at 2x for retina screens.
//
//   bun scripts/render-x-cover.ts
//
// The page is self-contained: every colour in it is a site token
// (src/styles/global.css) and the type is Fira Code, the same latin variable
// file the layouts preload, so the banners match the two themes. Design tool
// only — nothing in the site build reads these files.
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import puppeteer from "puppeteer";

const SOURCE = "brand/x-cover.html";
const THEMES = ["dark", "light"] as const;
const SCALES = [
  { deviceScaleFactor: 1, suffix: "" },
  { deviceScaleFactor: 2, suffix: "@2x" }
] as const;

// --no-sandbox: CI runners (GitHub ubuntu-24.04 AppArmor, container builds)
// block Chrome's sandbox; safe here since we only render our own local page
// (same launch as generate-resume.ts would use if it ran outside CI).
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"]
});

try {
  const page = await browser.newPage();
  for (const theme of THEMES) {
    for (const { deviceScaleFactor, suffix } of SCALES) {
      await page.setViewport({ width: 1500, height: 500, deviceScaleFactor });
      await page.goto(`${pathToFileURL(SOURCE).href}?theme=${theme}`, {
        waitUntil: "networkidle0"
      });
      // Fira Code is a webfont: shoot only once it has applied, or the banners
      // get the fallback face and different metrics.
      await page.evaluate(() => document.fonts.ready);
      const out = join("brand", `x-cover-${theme}${suffix}.png`);
      await page.screenshot({ path: out });
      console.log(out);
    }
  }
} finally {
  await browser.close();
}
