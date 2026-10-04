import puppeteer, { type Browser } from "puppeteer";

// Headless Chrome for the build-time renderers (diagrams, resume PDF).
// --no-sandbox because CI AppArmor blocks Chrome's sandbox; it's safe for our own pages.
const LAUNCH_ARGS = ["--no-sandbox", "--disable-setuid-sandbox"];

export async function launchBrowser(tag: string): Promise<Browser> {
  try {
    return await puppeteer.launch({ headless: true, args: LAUNCH_ARGS });
  } catch (err) {
    // Workers Builds' image lacks Chrome's system libraries (libatk etc.);
    // @sparticuz/chromium bundles them.
    console.warn(
      `[${tag}] system chrome failed (${(err instanceof Error ? err.message : String(err)).split("\n")[0]}); ` +
        "falling back to @sparticuz/chromium"
    );
    const { default: chromium } = await import("@sparticuz/chromium");
    return puppeteer.launch({
      headless: true,
      executablePath: await chromium.executablePath(),
      args: [...chromium.args, ...LAUNCH_ARGS]
    });
  }
}
