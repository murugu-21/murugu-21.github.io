---
name: verify-murugappan-dev
description: Drive murugappan.dev (Astro site plus Cloudflare Worker) the way a visitor or an agent does, on a private local instance, and capture proof. Use to prove a UI, blog, chat widget, REST API, MCP or 404 change works in the real built site, not just in tests, and for the Definition of done's browser check in both themes.
---

# Verify murugappan.dev

Two surfaces. Visitors use the web pages (portfolio, blog, Jarvis chat widget) in a browser. Agents and developers use the Worker's HTTP routes (`/api/v1`, `/mcp`, discovery documents, the negotiated 404). Both come from one `wrangler dev` running the built Worker (`dist-worker/`) over the built site (`dist/`).

Drive the browser with the chrome-devtools MCP and HTTP with `curl`. Without the chrome-devtools MCP, drive the same handles with the repo's `playwright` devDependency; the recipes' handles and end states don't change.

Read [`features/README.md`](features/README.md) before driving, then the feature file for what you're proving.

## Launch

Never use `bun run preview`. It binds `:8787` and `.wrangler/state`, which belong to the user's own preview. This launch gets its own port, inspector port and state directory.

```bash
cd "$(git rev-parse --show-toplevel)"
RUN="${SCRATCHPAD:-${TMPDIR:-/tmp}}/verify-murugappan-dev/$(date +%Y%m%dT%H%M%S)"
mkdir -p "$RUN/evidence"
PUBLIC_CHAT_HOST= POST_HOG_TOKEN= bun run build > "$RUN/build.log" 2>&1 || { tail -40 "$RUN/build.log"; exit 1; }
nohup node node_modules/wrangler/bin/wrangler.js dev \
  --port 8791 --inspector-port 9291 --local-upstream localhost:8791 \
  --persist-to "$RUN/state" --show-interactive-dev-session=false \
  > "$RUN/worker.log" 2>&1 &
echo $! > "$RUN/worker.pid"
for i in $(seq 60); do grep -q 'Ready on http://localhost:8791' "$RUN/worker.log" && break; sleep 0.5; done
grep 'Ready on' "$RUN/worker.log"
echo "RUN=$RUN"
```

Shell state doesn't carry between commands, and `$RUN` can't be recomputed. Start every later command with `RUN=<the printed path>`. Set `SCRATCHPAD` to your session scratchpad if your harness names one. Run wrangler with `node`, never `bun` or `bunx`: under Bun it reports ready but never answers.

The build takes about 15 s and rewrites the shared `dist/`, which the user's preview also serves. Don't start it while another build or a pre-push run is going: both regenerate `.astro/`, and the resume step holds port 4398. The two blanked variables keep the build's chat widget on the page's own origin rather than the `.env` value, and leave out production analytics.

If `:8791` is taken by another run, pick a free port and use it everywhere `8791` appears, `--local-upstream` included.

`wrangler dev` serves the Worker that `bun run build` bundled to `dist-worker/`, with the site content inside it, so nothing hot-reloads. After editing `worker/`, `packages/content/`, pages, posts or `public/`, run Cleanup, then Launch again, which rebuilds.

## Doctor

Run before the first drive, and again after any surprising result.

```bash
: "${RUN:?set RUN to the path Launch printed}"
kill -0 "$(cat "$RUN/worker.pid")" && echo "worker: ours, alive"
curl -sS -o /dev/null -w 'api: %{http_code}\n' http://localhost:8791/api/v1/profile
curl -sS http://localhost:8791/mcp.json | grep -c '"url": "http://localhost:8791/mcp"'
test -f dist/index.html && find src worker content public astro.config.ts -newer dist/index.html -type f \
  -not -name '*.test.*' -not -path '*/__screenshots__/*' | head -3
```

Healthy means all of these hold:

- The PID is alive.
- The API answers `200`.
- The manifest count is `1`, which proves the instance was launched with `--local-upstream localhost:8791`.
- The last line prints nothing and exits `0`. That means the build exists and is newer than every source it's built from.

Anything else means stop. A dead PID with `:8791` still answering means someone else's instance, so don't drive it. A file listed by `find` means rebuild.

## Drive

The browser recipes use these chrome-devtools MCP calls:

- `new_page` with `url: "http://localhost:8791/…"`, `isolatedContext: "verify-<basename of $RUN>"` and `background: true`. A context outlives its pages, so a reused name brings back the last run's `localStorage`.
- Pass the `pageId` that `new_page` returns to every later call. Drive only pages you opened. Other tabs (for example `:8787`) belong to the user.
- `take_snapshot`, then `click` or `fill` by the `uid` of an accessible name. Names are listed per feature. uids change after navigation and whenever a menu or dialog opens or closes, so re-snapshot before reusing one.
- `emulate` with `colorScheme: "light"` or `"dark"` sets the OS preference for an open page. Reload after it.
- `evaluate_script` reads state. Use it only to observe, never to act. A synthetic `.click()` skips the pointer events the chat widget hydrates on.

HTTP recipes are `curl` against `http://localhost:8791`. Wrangler's local trace and log store answers SQL:

```bash
curl -sS -X POST http://localhost:8791/cdn-cgi/local/explorer/api/local/observability/query \
  -H 'Content-Type: application/json' \
  -d '{"sql":"SELECT name, outcome, duration_ms FROM spans WHERE parent_id IS NULL ORDER BY rowid DESC LIMIT 20"}'
```

## Evidence

Everything goes under `$RUN/evidence/<feature>/`, named `<sub-feature-id>.<ext>`, for example `theme-toggle.png`.

- **Browser.** `take_snapshot` with `filePath` (`.aria.txt`) and `take_screenshot` with `filePath` (`.png`), before and after the action. Open the screenshot and look at it. A build can pass with invisible text.
- **HTTP.** `curl -sS -D "$E/<id>.headers" -o "$E/<id>.body" -w '%{http_code}\n' …`. Keep the status, headers and body.
- **Standards.** Drive the user's path, not a setter or test route. Capture the action and the resulting state. Confirm a mutation from a second view, such as a reload, another page or another endpoint. A feature with several entry points isn't proven by one of them.

Never verify against production. No `--remote`, no deploys, and no requests to `https://murugappan.dev` that write or send.

## Cleanup

```bash
: "${RUN:?set RUN to the path Launch printed}"
kill "$(cat "$RUN/worker.pid")"
for i in $(seq 20); do lsof -nP -iTCP:8791 -sTCP:LISTEN >/dev/null || break; sleep 0.5; done
lsof -nP -iTCP:8791 -sTCP:LISTEN || echo "8791 free"
rm -rf "$RUN/state"
ls "$RUN/evidence"
```

`workerd` exits with its wrangler parent, and wrangler's temp files go with it. Copy anything you need from `.wrangler/tmp/` before this step. Close every page you opened with `close_page`. Kill only the PID in `$RUN/worker.pid`, never by process name: the user's `astro dev` and preview are shared. Don't delete `dist/` or `.wrangler/`. The evidence and logs stay.
