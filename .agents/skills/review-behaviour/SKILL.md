---
name: review-behaviour
description: QA craft for the Behaviour/QA reviewer in AGENTS.md › Definition of done. Use whenever you review a diff in this repo for whether it does what was asked, which edge cases and regressions it misses, and whether its tests can fail. It covers risk mapping, test design, test-quality checks, what to run, and the report format. Pair it with verify-murugappan-dev, which says how to launch and drive the site.
---

# Review behaviour

You review one diff as a tester. Your job is to find what breaks, what the diff claims without proof, and which tests could never fail. You don't review style. The code-style reviewer does that.

Read AGENTS.md › Tests first. Use [verify-murugappan-dev](../verify-murugappan-dev/SKILL.md) for anything you run against the built site. Work through the five phases in order. Each one feeds the report.

## 1. Map the risk

1. Write the change's claim in one line. Then list every other claim the diff makes: commit body, README edits, `packages/content/agent-guide.md`, OpenAPI descriptions, test names. Each claim needs evidence by the end.
2. Tag each changed file with its surface and the check that proves it.

   | Changed                                                                            | Proven by                                                                                                          |
   | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
   | React island, `apps/site/src/**/*.tsx`                                             | `browser` test project, plus a verify browser recipe                                                               |
   | `.astro` page or layout, `global.css`                                              | the build, plus a verify browser recipe in both themes. No test renders `.astro`.                                  |
   | Worker route, guard, pipe or middleware, `apps/api/src/**`                         | `workers` project through `apiClient` or `fetchWorker`, plus a verify curl recipe                                  |
   | Durable Object (`*.durable-object.ts`)                                             | `workers` project with `runInDurableObject`. Treat it as stateful and timed.                                       |
   | `packages/contracts/**`                                                            | both apps, `/openapi.json` and the MCP tool schemas                                                                |
   | `packages/content/**`                                                              | pages, `/api/v1/*`, MCP resources, `index.md`, `llms.txt`, chat grounding, and the verify recipes' expected counts |
   | `apps/site/public/_headers`, `astro.config.ts`, `wrangler.jsonc`, `vite.config.ts` | every page or route. No test covers `_headers`.                                                                    |

3. Find the blast radius with grep, not by guessing. List the consumers of every changed export, constant and CSS token. `Layout.astro`, `global.css`, `browser-support.ts`, the theme bootstrap and the middleware in `app.ts` reach every page or route.
4. Spend effort on the highest risk first. High impact here means it bills DeepSeek, sends email, writes durable state (D1, Durable Object storage), changes a public contract (`/api/v1`, `/mcp`, `/openapi.json`, `/.well-known/*`, markdown pages), or runs on every page load.
5. List the silent failures that no gate in `.githooks/pre-push` catches, and check each one that applies:
   - a wrong or missing header (`Vary`, `Cache-Control`, `Content-Type` charset, `Link`, `Allow`, CORS, `RateLimit-*`)
   - a change that shows in only one theme, or only on a phone
   - a broken no-JS page
   - a renamed accessible name, which breaks screen readers and the verify recipes
   - a focus, keyboard or `prefers-reduced-motion` regression
   - a CSS or JS feature above the browser floor (README › Browser support). Tests run only in Chromium.
   - a prompt or tool-schema change, which the scripted test model can't notice
6. For a bug fix, confirm the root cause, then search for the same flaw elsewhere. The REST contact route and the MCP `send_message` tool share validation. The `pages`, `audio` and `well-known` controllers set similar headers.
7. Write a two-to-four-line charter: "Explore <area> with <tests, verify feature, curl> to find <top risks>." It bounds your session and becomes the report's coverage section.

## 2. Design the cases

Design your own cases before you read the diff's tests, then compare. A missing case is a finding.

- **Partitions.** Name the valid and invalid classes of every input the diff touches, and expect one case per class. Inputs include query params, request bodies, `Accept`, `Origin`, `Content-Type`, `Range`, `If-None-Match`, `MCP-Protocol-Version`, chat frames and the `localStorage` keys.
- **Boundaries.** Test each limit at the limit and on both sides of it (19, 20, 21). The two-value set misses `x <= 10` written as `x == 10`. Limits live as named constants, such as `MAX_MESSAGE_LENGTH`, `POSTS_LIMIT_MAX`, `CONTACT_DAILY_PER_CLIENT` and `ROOM_DAILY_LIMIT`. Grep `packages/contracts` and the touched module for the rest.
- **States.** For anything with modes, list the states, cover every valid transition and one invalid event per state. Examples are the chat widget (unhydrated, hydrating with a queued tap, open, menu, start over), a chat turn (idle, running, done, error, limit, cancelled, a second tab sending mid-turn), the theme (OS default, stored choice, OS change) and a quota (fresh, partial, exhausted, next window).
- **Decision tables.** When conditions combine, enumerate the rows and check each row's status, headers and body. Content negotiation is `Accept` × page has `index.md` × `GET`/`HEAD` × `If-None-Match`. MCP is `Content-Type` × `Accept` × `Origin` × method.
- **Pairwise.** A UI change with four factors (theme, viewport, reduced motion, JS on or off) needs four or five runs that cover every pair, not sixteen.
- **Hostile data.** Aim these at what the diff parses or renders: empty, whitespace only, 5,000+ characters, emoji, right-to-left text, CRLF, `</script>`, `<img onerror>`, markdown, `..%2F`, a trailing slash or none, duplicate params, unknown enum values, `HEAD`, an `OPTIONS` preflight, a double submit.
- **Time.** For every `Date.now()`, TTL, window or timer, test just before, at and just after the edge with a fake clock. Contact resets at UTC midnight, room messages over a rolling 24 hours, reads every 60 seconds. `Retry-After` and reset values are never 0 or negative.
- **Interruptions.** Close the panel, start over, reload or go offline mid-stream. Evict a Durable Object mid-turn and check the turn doesn't bill twice. Open two tabs on one room.
- **Oracles.** Name the expected result's source before you run a case. Standards: RFC 9110, the MCP transport spec, WCAG 2.2. Consistency within the product: an MCP tool returns what its `/api/v1` twin returns, an `index.md` says what its HTML page says, `/openapi.json` matches the router. History: the build of `main`. Claims: the READMEs and the agent guide.

## 3. Check the tests

1. Apply the `undefined` check from AGENTS.md › Tests to every test the diff adds or changes. A fixture or helper that computes the expected value is shape 3 or 5, even when lint passes it.
2. Run a mutation pass over every changed production line. Pick the likeliest one-line bug (`<` to `<=`, `&&` to `||`, `if (c)` to `if (true)`, `?.` to `.`, a string to `""`, a list to `[]`, a deleted block, `startsWith` to `endsWith`) and name the test that fails for it. No failing test is a finding. For a limit, a gating order or a negotiation rule, apply the mutation in a scratch worktree and watch a test go red.
3. A bug-fix test must fail without the fix. Check out the base commit in a scratch worktree, apply only the test hunk, run it, and keep the red output.
4. Check the level. Route behaviour goes through `apiClient` (or `fetchWorker` for a request the typed client can't express) or a real socket in `workers`, not a direct call to a controller or service. A unit test sits beside its source (apps/api/README.md › Layers). An island renders `<Component />` in `browser` and acts through `page.getByRole`. Pure logic goes in `node`. Ask to delete a lower test that a new higher one now duplicates.
5. Check assertion strength. Compare status, headers and bodies against literals. Parse JSON with zod and assert the fields the behaviour is about. Pair each absence assertion with a presence on another input. A `HEAD` test asserts the `GET` headers and an empty body.
6. Hunt flakiness:
   - **Time.** `Date.now()`, `new Date()` or a `setTimeout` wait without `vi.useFakeTimers` or `vi.setSystemTime`, or fake timers left on.
   - **Randomness.** `Math.random` or `crypto.randomUUID` in a value an assertion reads.
   - **Shared state.** The Workers pool isolates storage per test file, not per test. Two tests in one file that use the same Durable Object name, D1 rows or module state are coupled. Each needs a unique name.
   - **Async.** A fixed sleep instead of `expect.element(…)`, `vi.waitFor` or awaiting the frame. A stream or socket not drained.
   - **Network.** A real `fetch` outside a `live`-tagged test.
   - **Content.** An assertion on today's post or tag count where a fixture or a relation would do.
7. Suggest a fast-check property only where the invariant is cheap to state and the input space is wide: parsers, `Accept` negotiation, search results being a subset of all posts, a URL round trip. Never reimplement the code as the oracle.
8. The `workers` chat tests use a scripted model, so they prove plumbing, not model behaviour. A change to `prompt.ts`, a tool schema or `deepseek.client.ts` needs `bun run test:live`, which bills about three turns. Ask the user first. Assert structure (tool calls, captured lead fields), never prose, and report k of N runs.

## 4. Run it

1. Run the narrowest project first (`bun run test --project workers <path>.test.ts`), then `bun run test`. Never `bun test`.
2. Run each changed test file three times. Every run shuffles (`vite.config.ts`), so a test that fails on one seed depends on order. Replay it with `--sequence.seed=<seed>`.
3. Drive the built site with the verify skill for any change a visitor or agent can reach. Run the touched feature's sub-features and one neighbour as a regression probe: an API change also runs `mcp-tools-call`, because MCP reuses the services. For a surface `verify-murugappan-dev/features/README.md` lists as not yet mapped, drive it by hand and say so.
4. Save headers (`curl -D`) for every touched route and check them: the status (JSON 404 under `/api`, `Allow` on 405, `Retry-After` on 429), `Content-Type` with charset, `Vary: Accept` on every negotiated response including 404 and 304, `Cache-Control` that matches intent, an ETag with a 304 on a match, `HEAD` matching `GET`, and the CORS preflight.
5. For an API or MCP change, build `main` and the branch and diff `/openapi.json` and the MCP `tools/list` with `jq -S`. A removed path, method or property, a newly required field, a narrower type, a changed status or a renamed tool breaks `v1`. It needs the versioning module, not a silent change. `openapi-document.test.ts` proves only that the spec matches the router.
6. For changed UI, check WCAG 2.2 AA in the verify instance. Go through it keyboard-only: tab order, a visible focus ring that the sticky header and chat launcher don't cover, Escape closes and returns focus, no trap. Check names and roles in `take_snapshot`, live regions that are polite for routine updates, targets of at least 24 by 24 px, contrast in both themes, reflow at 320 px wide, and `lighthouse_audit` accessibility at 1.
7. The chrome-devtools `emulate` tool can't set reduced motion or turn off JavaScript. Use the repo's `playwright` with `newContext({ reducedMotion: "reduce" })` and `newContext({ javaScriptEnabled: false })`. Animations stop, and content, nav and links still work without hydration.
8. For a UI, font, image or island change, record a performance trace on a phone viewport at 4× CPU throttling. Expect LCP at most 2.5 s, CLS at most 0.1 and interactions at most 200 ms. The chat widget hydrates on the first tap, so measure that tap. Compare `du -sh apps/site/dist/_astro` with `main`.
9. For every new CSS feature, JS API or HTML attribute, check MDN or Baseline against the floor in README › Browser support. Below it, the feature degrades gracefully or `MIN_VERSIONS` and `redirectIfOutdated` change together.
10. At every new or changed boundary, check that zod validates input in the Worker with a maximum length, that a new route has a method allowlist, a CORS decision, a rate limit and an error body without internals, that `set:html` takes only trusted or escaped content, that model and visitor text render as text, and that socket and MCP handshakes check `Origin`.
11. On every billed or sending path, validation, dry run and quota run before the paid call. A dry run spends and sends nothing. A failure never retries a billed turn. Never verify against production. Locally, the `EMAIL` binding writes to `.wrangler/tmp/email/` instead of sending.

## 5. Report

Mark each finding Verified (reproduced, with a command and an evidence path) or Suspected (reasoned from code, with the reason you couldn't reproduce it). Report one finding per root cause at its worst honest impact, and list the other places it appears. Every finding names the test that would catch it.

Severity:

- **Blocker.** Data loss, unbounded spend or email, a security hole, a broken public contract, a page or route that fails, a WCAG A failure on a core path, or a failing gate.
- **Major.** Wrong behaviour on a real but bounded path, a fix without a regression test, a test that can't fail, a flaky or order-dependent test, a WCAG AA failure, breakage above the browser floor, or a wrong `Vary` or `Cache-Control` on a negotiated response.
- **Minor.** An untested boundary or edge case, a weak assertion, or a performance regression within budget.
- **Nit.** Test naming, only when it hides intent.

Use this template:

```markdown
## Behaviour review: <branch or range>

Verdict: PASS | PASS WITH FINDINGS | FAIL (any Blocker, or a Major left standing)

### Charter

Explore <area> with <tools> to find <risks>. Surfaces: <list>. Blast radius: <consumers found by grep>.

### Findings

#### QA-1 <what a user or agent sees> [Blocker|Major|Minor|Nit] [Verified|Suspected]

- Where: `path/file.ts:123`, and other places with the same flaw
- Oracle: <standard, consistency, history or claim>. Expected <X>, got <Y>.
- Reproduce: <exact commands>
- Evidence: <paths under $RUN/evidence/, test output>
- Missing test: <project> › `<file>`, "<test name>", asserting `<literal>`
- Why not reproduced (Suspected only): <missing precondition, would bill, other browser>

### Tests in the diff

| Test | Fails if code returns undefined | Kills the likeliest mutation | Deterministic | Right level |
| ---- | ------------------------------- | ---------------------------- | ------------- | ----------- |

### Coverage

- Ran: <commands, verify sub-feature IDs, repeat and shuffle runs, base-commit red run>
- Not run, and why: <test:live, Firefox and Safari, unmapped feature>
```

A clean review without the coverage section is not a pass.
