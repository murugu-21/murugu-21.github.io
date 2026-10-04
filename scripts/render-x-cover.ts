// Renders the X profile banners from brand/x-cover.html: both themes, 1x
// (1500x500) and 2x. Not part of the site build.
//
//   bun scripts/render-x-cover.ts
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { launchBrowser } from "./launch-browser.ts";

const SOURCE = "brand/x-cover.html";
const THEMES = ["dark", "light"] as const;
const SCALES = [
  { deviceScaleFactor: 1, suffix: "" },
  { deviceScaleFactor: 2, suffix: "@2x" }
] as const;

await using browser = await launchBrowser("render-x-cover");
const page = await browser.newPage();
for (const theme of THEMES) {
  for (const { deviceScaleFactor, suffix } of SCALES) {
    await page.setViewport({ width: 1500, height: 500, deviceScaleFactor });
    await page.goto(`${pathToFileURL(SOURCE).href}?theme=${theme}`, {
      waitUntil: "networkidle0"
    });
    // wait for the webfont, or the shot uses the fallback face
    await page.evaluate(() => document.fonts.ready);
    const out = join("brand", `x-cover-${theme}${suffix}.png`);
    await page.screenshot({ path: out });
    console.log(out);
  }
}
