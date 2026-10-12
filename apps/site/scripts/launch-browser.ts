import puppeteer, { type Browser, type LaunchOptions, ProtocolError } from "puppeteer";

// Headless Chrome for the renderers (diagrams, resume PDF).
// --no-sandbox because CI AppArmor blocks Chrome's sandbox; it's safe for our own pages.
const LAUNCH_ARGS = ["--no-sandbox", "--disable-setuid-sandbox"];

export async function launchBrowser(
  tag: string,
  { protocolTimeout }: Pick<LaunchOptions, "protocolTimeout"> = {}
): Promise<Browser> {
  try {
    return await puppeteer.launch({ headless: true, args: LAUNCH_ARGS, protocolTimeout });
  } catch (err) {
    // A timed-out launch is the caller's to retry, not a sign that Chrome's libraries are missing.
    if (err instanceof ProtocolError) throw err;
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
      args: [...chromium.args, ...LAUNCH_ARGS],
      protocolTimeout
    });
  }
}
