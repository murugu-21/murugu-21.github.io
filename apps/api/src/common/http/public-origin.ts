const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Forces https for real hosts, since Cloudflare redirects http at the edge. */
export function publicOrigin(requestUrl: string): string {
  const url = new URL(requestUrl);
  if (!LOCAL_HOSTS.has(url.hostname)) url.protocol = "https:";
  return url.origin;
}
