// fetch_page tool backend: returns the full text of a murugappan.dev page so
// the model can answer detail questions without carrying full-text grounding
// in every prompt. Reads exclusively through the ASSETS binding (our own
// static build), so it physically cannot reach other hosts. Results are
// tool-result strings either way — errors are phrased for the model to relay.

const SITE_HOST = "murugappan.dev";
const MAX_CHARS = 24_000;

type AssetsLike = {fetch(input: string): Promise<Response>};

function normalize(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

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

export async function fetchSitePage(
  assets: AssetsLike,
  rawUrl: string
): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl, `https://${SITE_HOST}`);
  } catch {
    return "That is not a valid URL.";
  }
  if (url.hostname !== SITE_HOST && url.hostname !== `www.${SITE_HOST}`) {
    return `Only pages on ${SITE_HOST} can be fetched.`;
  }

  // Blog posts live pre-extracted in the full-text llms file — cleaner than
  // stripping HTML, and it covers every post section by its URL marker.
  if (url.pathname.startsWith("/blog/")) {
    const full = await assetText(assets, "/blog/llms-full.txt");
    if (full) {
      const target = normalize(`https://${SITE_HOST}${url.pathname}`);
      const section = full
        .split(/\n(?=# )/)
        .find(
          s =>
            s.includes(`URL: ${target}`) ||
            s.includes(`URL: ${target.slice(0, -1)}`)
        );
      if (section) return section.slice(0, MAX_CHARS);
    }
  }

  const res = await assets
    .fetch(`https://assets.local${url.pathname}`)
    .catch(() => null);
  if (!res || !res.ok) {
    return "That page was not found on the site.";
  }
  const body = await res.text();
  const text = url.pathname.endsWith(".txt") ? body : htmlToText(body);
  return text.slice(0, MAX_CHARS) || "That page has no readable text.";
}

async function assetText(
  assets: AssetsLike,
  path: string
): Promise<string | null> {
  try {
    const res = await assets.fetch(`https://assets.local${path}`);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}
