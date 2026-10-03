# AGENTS.md

Rules for coding agents working in this repo. (`public/AGENTS.md` is a different file: the public guide served at murugappan.dev/AGENTS.md for agents using the site's API.) `README.md` covers the architecture and tooling; read it before changing the build, the Worker or the dev setup.

## Comments

- Don't restate what the code already says. No `// increment counter` above `count++`.
- Comment the _why_ only when it isn't obvious from the code: a workaround, a constraint, a surprising choice. One or two lines.
- Drop historical context ("used to be X", "changed in PR #12", "moved from Y") once it no longer explains the current code. Git history keeps it.

## Tests

- Don't write tests that eat CI time without catching real bugs: tests that restate the implementation, assert on mocks, check trivial getters, or duplicate another test's coverage.
- Prefer end-to-end and integration tests that exercise critical user-facing behaviour over many small unit tests.
- When you touch an area, delete tests there that have become redundant.

## Code style

Think about readability and elegance before writing, not after. Every rule a linter can check lives in `.oxlintrc.json` and `bun run lint` enforces it; read that file rather than relying on memory. On top of those:

- Write new code in TypeScript.
- **Guard clauses.** Return or throw early on edge cases so the main path isn't nested inside `if`/`else`.
- **Named parameters (an options object).** Lint caps functions at 3 parameters; below that, a new or changed function whose parameters share a type also takes a single destructured object (`fn({ from, to })`, not `fn(from, to)`) so call sites can't silently swap them.
- **No `as` casts** (lint allows only `as const`). Fix the type instead: `satisfies` to check a value against a type without widening it, a type guard or `in` check to narrow, zod for parsed or untrusted data.
- **No `any` leaks.** Type-aware lint rejects annotating an `any` (`const x: T = JSON.parse(...)`, `await res.json()`). Take it as `unknown` and narrow it. Lint can't catch two cases, so check them by hand: `.astro` scripts (type-aware rules don't run there), and the Workers generics `res.json<T>()` / `storage.get<T>()`, which are casts in disguise (call them without a type argument and parse the result).
- **DRY and YAGNI.** Extract a helper once logic repeats, not before. Don't add options, abstractions or config for needs that don't exist yet.

## Research before building

Agents tend to hand-roll what a library or platform feature already does. Before building a new feature or module, adding a dependency, or writing a utility more than a few lines long, look up the current best practice and the maintained options (including what the repo already depends on), then bring the user a short recommendation with alternatives and wait for approval before writing it.

## Ask first

- Anything that costs money or is hard to undo: new paid services or plans, deploys, `wrangler` commands against remote resources, D1 migrations, R2 writes.
- Major decisions: adding or replacing a dependency, changing the architecture, CI, or `wrangler.jsonc`.

## Never

- Stop or kill a dev server you didn't start. The user's `astro dev` is shared; stop only the ones your own session spun up.
- Bypass a failing gate: no `--no-verify`, skipped tests, or loosened lint rules to get green. Fix the cause.

## Commits

`.githooks/commit-msg` enforces the format and lists the allowed types.

## Definition of done

Never call a task complete until both of the following have happened.

1. `.githooks/pre-push` passes (format, lint, typechecks, tests). For UI changes, also run `bun run build` and `bun run preview`, then check the page in the browser in both light and dark themes.
2. Two independent reviewers (separate subagents, each starting fresh with only the diff and these rules) have reviewed the change:
   - **Behaviour/QA reviewer:** does it do what was asked, are edge cases and regressions covered, does it actually work when run.
   - **Code-style reviewer:** checks the diff against every rule in this file and `.oxlintrc.json`.

   Fix what they find, or explain why a finding doesn't apply, before reporting the task as done.
