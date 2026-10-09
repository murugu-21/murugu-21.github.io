# Agent discovery and 404

An agent that has never seen the site can find the API and the MCP server from well-known documents. A wrong guess gets a real 404 that points it somewhere useful. A browser gets the styled page and an agent gets markdown.

## Sub-features

- `discovery-catalog` serves the API catalogue as a link set.
- `notfound-html` answers a browser's miss with the styled 404 page.
- `notfound-markdown` answers any other miss with a markdown guide to the site.
- `redirect-guesses` sends common docs guesses to `/developers/`.

## How to get to it (user POV)

- `GET /.well-known/api-catalog`.
- Open a missing path in a browser, or fetch it with `curl`.
- Open `/docs`, `/api-docs`, `/developer`, `/api-reference` or `/mcp-server`, with or without a trailing slash.

## Driving it with curl

Preconditions:

- `B=http://localhost:8791; E="$RUN/evidence/agent-discovery"; mkdir -p "$E"`.

Steps:

- **`discovery-catalog`.** `curl -sS -i "$B/.well-known/api-catalog"` returns `200` with `Content-Type: application/linkset+json` and entries anchored at `http://localhost:8791/api/v1` and `http://localhost:8791/mcp`.
- **`notfound-html`.** `curl -sS -i -H 'Accept: text/html' "$B/nope"` returns `404`, `Content-Type: text/html`, `Vary: Accept` and the title `Page not found | Murugappan M`.
- **`notfound-markdown`.** `curl -sS -i "$B/nope"` returns `404` with `Content-Type: text/markdown`. The body opens with a `# 404 Not Found` heading, then `` `/nope` is not a path on murugappan.dev ``, and lists the sitemap, `llms.txt` and the API.
- **`redirect-guesses`.** `for p in docs api-docs developer api-reference mcp-server; do for s in '' /; do curl -sS -o /dev/null -w "/$p$s %{http_code} %{redirect_url}\n" "$B/$p$s"; done; done` prints `301 http://localhost:8791/developers/` on all ten lines.

## Gotchas

- `curl` sends `Accept: */*`, which gets markdown. Pass `-H 'Accept: text/html'` for the page.
- The 404 body's links name `https://murugappan.dev`, not the local host. `/mcp.json` and the catalogue are the documents that name the answering host.
- A miss under `/blog/` gets the blog's 404 page (`404: Not Found | SDE Journey`), not the site's.
