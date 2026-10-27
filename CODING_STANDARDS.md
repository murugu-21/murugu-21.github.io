# Coding standards

## Research first

Agents hand-roll what a library or platform feature already does, and a reviewer only sees the hand-roll in the diff, after the work is done. For the work `AGENTS.md` › Ask first sends here, search in order: the repo's dependencies, the framework's and platform's docs, then npm. Bring the user a short recommendation naming what you searched, what you would pick and why the others lost, and wait for approval before writing it.

## Comments

- Comment only the _why_ the code can't show: a workaround, a constraint, a surprising choice. One or two lines.
- Leave history ("used to be X", "changed in PR #12", "moved from Y") to git once it no longer explains the current code.

## Tests

- Prefer end-to-end and integration tests that exercise critical user-facing behaviour over many small unit tests.
- When you touch an area, delete tests there that have become redundant, including ones that duplicate another test's coverage.

### Test behaviour, not implementation

A test calls the code the way its users do and asserts the result they observe against a literal expected value.

**The check.** Before you keep a test, ask whether it would still pass if every function it imports returned `undefined`. If yes, it cannot fail for a defect.

Five shapes that still pass when every imported function returns `undefined`:

1. **Weak or no assertion.** No `expect`, or only `toBeDefined`, `toBeTruthy`, `not.toThrow`, `toBeInstanceOf`, `toBeGreaterThan(0)`.
2. **Mock or absence only.** Only `toHaveBeenCalled`, `not.toHaveBeenCalled`, `toBeNull`, `toBeUndefined`, `toEqual([])`, `toHaveLength(0)`, `not.toBe(wrongValue)`.
3. **Self-referential.** The expected value comes from the code under test: `expect(f(a)).toBe(f(a))`, `expect(parsed.url).toBe(buildUrl(…))`.
4. **Constant pin.** The assertion restates a hand-maintained constant, config default, table row or prompt: `expect(LIMITS.maxTools).toBe(8)`, `expect(PROMPT).toContain("You are")`. It also fails when someone edits that constant or prompt, so it blocks the edit.
5. **Fixture asserts fixture.** The assertion reads data the test built, and the code under test never runs.

**The fix.** Call the subject with one concrete input and assert the literal output or the observable effect: `expect(slugify("Hello, World!")).toBe("hello-world")`.

- For an absence, assert the presence on another input in the same test.
- For a constant, test the mechanism that reads it with one input instead of restating the value.
- For a mock, assert the payload it received or the state after the call.
- When no such assertion exists, delete the test.

Keep a test of a relation across a table's rows (a key present in two tables, a parent that exists), and a compile-time check in a `*.test-d.ts` file.

The `tests/observe-behaviour` lint rule flags the direct forms of each shape. In a browser test, rendering `<Component />` counts as calling the code, and a positive matcher on `expect.element(locator)` (`toBeVisible`, `toBeEnabled`) counts as an observation. It counts a helper import as touching the code, so a fixture built by a helper slips past it; apply the check yourself. Disable it only for a relation test or a false positive, with `-- <why>`, on the reported line (`oxlint-disable-next-line`) or around the whole test (`oxlint-disable` … `oxlint-enable`).

## Code style

`bun run lint` enforces every rule a linter can check. On top of it:

- **TypeScript.** Write new code in TypeScript.
- **Guard clauses.** Return or throw early on edge cases so the main path isn't nested inside `if`/`else`.
- **Named parameters (an options object).** A new or changed function whose parameters share a type takes a single destructured object (`fn({ from, to })`) so call sites can't silently swap them.
- **Fix the type instead of casting.** `satisfies` checks a value against a type without widening it, a type guard or `in` check narrows, and zod parses untrusted data. Only `as const` is allowed.
- **`unknown` at the edges.** Take an `any`-typed value as `unknown` and narrow it. Lint misses two cases, so check them by hand: `.astro` scripts (type-aware rules don't run there), and the Workers generics `res.json<T>()` / `storage.get<T>()`, which are casts in disguise (call them without a type argument and parse the result).
- **DRY and YAGNI.** Extract a helper once logic repeats, not before. Add options, abstractions and config only for a need that exists today.
