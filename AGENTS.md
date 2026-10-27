# AGENTS.md

To change the site's public `/AGENTS.md`, edit `packages/content/agent-guide.md`, not this file.

Before changing an area, read `README.md` and the feature README it links under "Where things are". Before writing or reviewing code or tests, read `CODING_STANDARDS.md`.

## Ask first

Get the user's approval before:

- Anything that costs money or is hard to undo: paid services or plans, deploys, `wrangler` against remote resources (`--remote`, deploy, secrets), D1 migrations, R2 writes.
- Changing the architecture, CI or `apps/api/wrangler.jsonc`.
- Building a new feature or module, adding or replacing a dependency, or writing a utility longer than a few lines. Research first and bring a recommendation (`CODING_STANDARDS.md` › Research first) before writing it.

## Never

- Stop a dev server you didn't start. The user's `bun run dev` (astro dev and the Worker's vp dev) and `bun run preview` are shared; stop only your own.
- Bypass a failing gate (`--no-verify`, skipped tests, loosened lint rules). Fix the cause.

## Definition of done

A task is done when, in order:

1. `.githooks/pre-push` passes, and a UI change has passed the `verify-murugappan-dev` browser check in light and dark themes.
2. Two fresh subagents, each given only the diff and its skill (`review-behaviour`, `review-code-style`), have reviewed it, and every finding is fixed or answered.
3. A fresh subagent prompted with `comment-sicko`'s SKILL.md verbatim plus the fixed diff has hunted its comments. Keep its deletions except a comment `CODING_STANDARDS.md` › Comments protects; restore that with the reason. For each `MUST KILL` flag, make the code say it (rename, extract, a type) or explain why it can't.
