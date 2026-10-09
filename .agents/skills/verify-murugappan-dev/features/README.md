# murugappan.dev verification map

## Baseline preconditions

- An instance launched by this run per [Launch](../SKILL.md#launch), at `http://localhost:8791`, with its own `--persist-to` state.
- The [Doctor](../SKILL.md#doctor) checks pass.
- `RUN` set to the path Launch printed, at the start of every command.

## Driving conventions

- Start each recipe from a fresh page in this run's isolated context unless its preconditions say otherwise.
- Act through accessible names from `take_snapshot`.
- Copy commands, accessible names and URLs exactly. Only `…` and `<…>` are placeholders.
- Expected titles and counts reflect the content when the recipe was written. When one differs, check `git log -- packages/content apps/site/src/data` before calling it a defect. A content change means the map needs updating.
- Anything that calls DeepSeek bills the owner. Ask the user before it, and count the turns.
- Collect proof as [Evidence](../SKILL.md#evidence) says.

## Skip reporting

- Report an unreachable path with the command tried and the missing precondition.
- Never report a path as verified when you proved it through a different entry point.

## Feature entry contract

Each feature file starts with an H1 and one paragraph on the user-visible behaviour, then exactly four H2s in this order.

1. `Sub-features` lists short IDs, one line each.
2. `How to get to it (user POV)` lists every entry point.
3. `Driving it with <harness>` starts with `Preconditions:`, then `Steps:`. Each step is labelled with its sub-feature ID and pairs an exact command with an observable result.
4. `Gotchas` lists traps that waste or invalidate a run.

Keep implementation detail out. Name only user paths, stable handles, required state, commands and observable proof.

## Features

- [Theme](./theme.md) covers the light/dark toggle, the OS default and persistence across both halves.
- [Blog index](./blog-index.md) covers search, tag chips and their URL mirroring.
- [Jarvis chat](./jarvis-chat.md) covers the launcher, the panel and its menu, and the billed send path.
- [Public API](./public-api.md) covers the read endpoints, the JSON 404 and the contact endpoint.
- [MCP server](./mcp-server.md) covers the manifest, the handshake, tool listing and tool calls.
- [Agent discovery and 404](./agent-discovery.md) covers the API catalogue, the content-negotiated 404 and the docs redirects.

Not yet mapped: the blog post page (Listen control, table of contents), the resume page and PDF, the outdated-browser redirect, `/developers`, `llms.txt` and the markdown renditions.
