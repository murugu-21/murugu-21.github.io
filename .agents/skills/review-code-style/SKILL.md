---
name: review-code-style
description: Framework best practices and house rules for the code-style reviewer in AGENTS.md › Definition of done. Use whenever you review a diff in this repo for code quality, readability or idiom, or check it against Astro, Tailwind, React, Hono, Effect, Cloudflare Workers, Durable Objects or the MCP server's conventions. It says what lint already enforces, which framework references to read for the paths the diff touches, and how to report.
---

# Review code style

You review one diff for how it is written, not whether it works. The Behaviour/QA reviewer runs it. Your sources, in order of authority: `CODING_STANDARDS.md` and AGENTS.md, the lint config (`tooling/lint.config.ts`, `biome.jsonc`, `tooling/biome/`, `tooling/oxlint/`), the README for the area, then the framework references below.

## 1. Let the tools go first

Run `bun run types`, then `bun run lint`, `bun run check:worker` and `bun run check:effect`. Without the generated Worker types, type-aware lint reports about 1,100 false errors in `apps/api`. A failing tool is a Blocker. Quote its output and stop reviewing that line.

Don't re-review what a rule already enforces. Every reference file opens with the rules that cover its area, so you can skip those and spend your attention on judgment. Do review every new or moved disable comment (`oxlint-disable`, `biome-ignore`, `@ts-expect-error`). Each needs a reason that is true and specific. "Needed", "false positive" and a reason that restates the rule are findings.

## 2. Check by hand what lint can't see

Check the diff against every rule in `CODING_STANDARDS.md` › Comments and › Code style. Look in `.astro` frontmatter and scripts too, where type-aware lint doesn't run. Then check:

- A new dependency, module or utility longer than a few lines came with research and the user's approval (`CODING_STANDARDS.md` › Research first). Code that arrived without them is a finding.
- Search before you judge a hand-roll. For new code longer than a few lines that implements a general-purpose concern rather than this site's domain (parsing a format, a protocol, escaping, a server, retries, CLI flags, a file format, a lint check), search in the order `CODING_STANDARDS.md` › Research first gives. Built-ins include Astro, React, Hono, Effect, Cloudflare Workers, Tailwind, the browser and Node. A missing-library finding names the replacement, its weekly downloads or official status, and what it would delete. When you find nothing, name what you searched, so the author can see the search happened.
- An import that lint blocks was moved to the right layer, not worked around (README.md › Imports).
- Tests follow `CODING_STANDARDS.md` › Tests. The QA reviewer judges what they cover. You judge their shape.

## 3. Read the references for the paths the diff touches

| The diff touches                                          | Read                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| `*.astro`                                                 | [astro.md](references/astro.md), [tailwind.md](references/tailwind.md) |
| `apps/site/src/**/*.tsx`                                  | [react.md](references/react.md), [tailwind.md](references/tailwind.md) |
| `apps/site/src/styles/**`, any `class` or `className`     | [tailwind.md](references/tailwind.md)                                  |
| `apps/api/src/**` controllers and plumbing                | [hono.md](references/hono.md), [workers.md](references/workers.md)     |
| `*.service.ts`, `*.repository.ts`, `app.module.ts`        | [effect.md](references/effect.md)                                      |
| `*.durable-object.ts`, `cloudflare.config.ts`, migrations | [workers.md](references/workers.md)                                    |
| `modules/mcp/**`, `packages/contracts/mcp.ts`             | [mcp.md](references/mcp.md), [hono.md](references/hono.md)             |
| `packages/contracts/**`                                   | [hono.md](references/hono.md) › zod at boundaries                      |

Every rule in a reference has an ID such as `ASTRO-3`. Cite it in the finding.

## 4. Report

Report one finding per root cause and list the other places it appears. Each finding has:

- **Where.** `path:line`.
- **Rule.** A `CODING_STANDARDS.md` or AGENTS.md section, a reference ID or a README section. A finding without a source is an opinion, so label it "suggestion".
- **Severity.** Blocker (a failing tool, an `as` cast or `any` leak, a layer break, a security lapse such as unescaped `set:html`), Major (a framework rule broken in a way that will cost later), Minor (idiom or readability), or Nit.
- **Fix.** The concrete change, as a short diff or one sentence.

End with a **Lint candidates** section. List any judgment rule you applied that a rule could check, with the selector or rule name if you know it. A finding that recurs belongs in lint, not in the next review (`CODING_STANDARDS.md` › Code style).

Use this template:

```markdown
## Code-style review: <branch or range>

Verdict: PASS | PASS WITH FINDINGS | FAIL (any Blocker, or a Major left standing)

Tools: types ✓ lint ✓ check:worker ✓ check:effect ✓

### Findings

#### CS-1 <one line> [Blocker|Major|Minor|Nit]

- Where: `path:line`, and other places with the same issue
- Rule: <CODING_STANDARDS.md › section | AGENTS.md › section | ASTRO-3 | README section | suggestion>
- Fix: <change>

### Disable comments added or moved

| Where | Rule | Reason holds? |
| ----- | ---- | ------------- |

### Lint candidates

- <rule idea>: <selector or built-in rule>
```
