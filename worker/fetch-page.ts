// fetch_page tool backend. Reads only through the ASSETS binding, so it cannot
// reach other hosts. Errors are tool-result strings phrased for the model.

import { readAsset, type AssetsLike } from "./api/store";

const SITE_HOST = "murugappan.dev";
const MAX_CHARS = 24_000;

function htmlToText(html: string): string {
  const scoped =
    /<article[\s\S]*?<\/article>/i.exec(html)?.[0] ??
    /<main[\s\S]*?<\/main>/i.exec(html)?.[0] ??
    /<body[\s\S]*?<\/body>/i.exec(html)?.[0] ??
    html;
  return scoped
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
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

  // Blog posts come pre-extracted from llms-full.txt, keyed by their URL marker.
  if (url.pathname.startsWith("/blog/")) {
    const full = await readAsset(assets, "/blog/llms-full.txt");
    if (full) {
      // Without its trailing slash, the marker matches the URL in either form.
      const marker = `URL: https://${SITE_HOST}${url.pathname.replace(/\/$/, "")}`;
      const section = full.split(/\n(?=# )/).find(s => s.includes(marker));
      if (section) return section.slice(0, MAX_CHARS);
    }
  }

  const body = await readAsset(assets, url.pathname);
  if (body === null) {
    return "That page was not found on the site.";
  }
  const text = url.pathname.endsWith(".txt") ? body : htmlToText(body);
  return text.slice(0, MAX_CHARS) || "That page has no readable text.";
}
