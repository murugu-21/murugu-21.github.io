const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Forces https for real hosts, since Cloudflare redirects http at the edge. */
export function publicOrigin(requestUrl: string): string {
  const url = new URL(requestUrl);
  if (!LOCAL_HOSTS.has(url.hostname)) url.protocol = "https:";
  return url.origin;
}

/**
 * Whether a browser page at `origin` belongs to the site the Worker answers at `requestUrl`. In
 * local dev the site and the Worker are on different ports, so any local page counts.
 */
export function isOwnOrigin({
  origin,
  requestUrl
}: {
  origin: string | undefined;
  requestUrl: string;
}): boolean {
  const page = origin ? URL.parse(origin) : null;
  if (!page) return false;
  const worker = new URL(requestUrl);
  if (LOCAL_HOSTS.has(worker.hostname)) return LOCAL_HOSTS.has(page.hostname);
  return page.protocol === "https:" && page.host === worker.host;
}
