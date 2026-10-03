# AGENTS.md

Rules for coding agents working in this repo. (`public/AGENTS.md` is a different file: the public guide served at murugappan.dev/AGENTS.md for agents using the site's API.) `README.md` covers the architecture and tooling; read it before changing the build, the Worker or the dev setup.

## Comments

- Don't restate what the code already says. No `// increment counter` above `count++`.
- Comment the _why_ only when it isn't obvious from the code: a workaround, a constraint, a surprising choice. One or two lines.
- Drop historical context ("used to be X", "changed in PR #12", "moved from Y") once it no longer explains the current code. Git history keeps it.

## Tests

- Prefer end-to-end and integration tests that exercise critical user-facing behaviour over many small unit tests.
- When you touch an area, delete tests there that have become redundant, including ones that duplicate another test's coverage.

### Test behaviour, not implementation

A test calls the code the way its users do and asserts the result they observe against a literal expected value. A test that only asserts which calls the code made, or restates a constant from it, observes nothing.

**The check:** before you keep a test, ask whether it would still pass if every function it imports returned `undefined`. If yes, it cannot fail for a defect: it costs CI time and review attention and catches nothing. Rewrite the assertion or delete the test. A constant pin also fails when someone edits the constant or prompt it restates, so it blocks that edit.

Five shapes that still pass when every imported function returns `undefined`:

1. **Weak or no assertion.** No `expect`, or only `toBeDefined`, `toBeTruthy`, `not.toThrow`, `toBeInstanceOf`, `toBeGreaterThan(0)`.
2. **Mock or absence only.** Only `toHaveBeenCalled`, `not.toHaveBeenCalled`, `toBeNull`, `toBeUndefined`, `toEqual([])`, `toHaveLength(0)`, `not.toBe(wrongValue)`.
3. **Self-referential.** The expected value comes from the code under test: `expect(f(a)).toBe(f(a))`, `expect(parsed.url).toBe(buildUrl(…))`.
4. **Constant pin.** The assertion restates a hand-maintained constant, config default, table row or prompt: `expect(LIMITS.maxTools).toBe(8)`, `expect(PROMPT).toContain("You are")`.
5. **Fixture asserts fixture.** The assertion reads data the test built, and the code under test never runs.

**The fix:** call the subject with one concrete input and assert the literal output or the observable effect: `expect(slugify("Hello, World!")).toBe("hello-world")`.

- For an absence, assert the presence on another input in the same test.
- For a constant, test the mechanism that reads it with one input instead of restating the value.
- For a mock, assert the payload it received or the state after the call, not that it was called.
- When no such assertion exists, delete the test.

Keep a test of a relation across a table's rows (a key present in two tables, a parent that exists), and a compile-time check in a `*.test-d.ts` file.

`tests/observe-behaviour` (`scripts/lint/test-behaviour.ts`) flags the direct forms of each shape, per test: shapes 1–3, a constant read straight into `expect`, and a test that never touches the code under test. Because a helper import counts as touching it, a fixture built by a helper slips through. For a relation test or a false positive, disable the rule on that test with a reason (`// oxlint-disable-next-line tests/observe-behaviour -- <why>`). The reviewers check what it can't see.

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
   - **Behaviour/QA reviewer:** does it do what was asked, are edge cases and regressions covered, does it actually work when run. For every test the diff adds or changes, applies the check in "Test behaviour, not implementation".
   - **Code-style reviewer:** checks the diff against every rule in this file and `.oxlintrc.json`.

   Fix what they find, or explain why a finding doesn't apply, before reporting the task as done.
