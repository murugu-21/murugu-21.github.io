// fetch_page tool backend. Reads only through the ASSETS binding, so it cannot
// reach other hosts. Errors are tool-result strings phrased for the model.

import { SITE_ORIGIN } from "#content/site.ts";

type AssetsLike = { fetch(input: string): Promise<Response> };

const SITE_HOST = new URL(SITE_ORIGIN).host;
const MAX_CHARS = 24_000;

/** The asset's text, or null when it is absent, non-2xx or the binding throws. */
async function readAsset(assets: AssetsLike, path: string): Promise<string | null> {
  try {
    // The assets binding matches only the path.
    const res = await assets.fetch(`https://assets.local${path}`);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

function htmlToText(html: string): string {
  const scoped =
    /<main[\s\S]*?<\/main>/i.exec(html)?.[0] ?? /<body[\s\S]*?<\/body>/i.exec(html)?.[0] ?? html;
  return scoped
    .replaceAll(/<script[\s\S]*?<\/script>/gi, " ")
    .replaceAll(/<style[\s\S]*?<\/style>/gi, " ")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll(/&#39;|&apos;/g, "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll(/[ \t]+/g, " ")
    .replaceAll(/\s*\n\s*/g, "\n")
    .trim();
}

export async function fetchSitePage(assets: AssetsLike, rawUrl: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl, `https://${SITE_HOST}`);
  } catch {
    return "That is not a valid URL.";
  }
  if (url.hostname !== SITE_HOST && url.hostname !== `www.${SITE_HOST}`) {
    return `Only pages on ${SITE_HOST} can be fetched.`;
  }

  // A blog page's index.md is its own markdown. Elsewhere it is the site summary, not the page.
  if (/^\/blog(\/|$)/.test(url.pathname)) {
    const markdown = await readAsset(assets, `${url.pathname.replace(/\/$/, "")}/index.md`);
    if (markdown) return markdown.slice(0, MAX_CHARS);
  }

  const body = await readAsset(assets, url.pathname);
  if (body === null) {
    return "That page was not found on the site.";
  }
  const text = url.pathname.endsWith(".txt") ? body : htmlToText(body);
  return text.slice(0, MAX_CHARS) || "That page has no readable text.";
}
