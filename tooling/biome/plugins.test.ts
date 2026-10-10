import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const BIOME = join(ROOT, "node_modules/.bin/biome");

// Biome reports real paths, and macOS links the temp folder from /var to /private/var.
const work = realpathSync(mkdtempSync(join(tmpdir(), "biome-plugins-")));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** Lints the given files with the repo's biome.jsonc and plugins, laid out as in the repo. */
function lint(files: Record<string, string>): string[] {
  const dir = mkdtempSync(join(work, "case-"));
  cpSync(join(ROOT, "biome.jsonc"), join(dir, "biome.jsonc"));
  cpSync(join(ROOT, "tooling/biome"), join(dir, "tooling/biome"), { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const { stdout } = spawnSync(BIOME, ["lint", "--reporter=github"], {
    cwd: dir,
    encoding: "utf8"
  });
  return [...stdout.matchAll(/^::error title=plugin,file=(.+?),line=(\d+),.*?::([^:\n]+)/gm)]
    .map(([, file = "", line, message]) => `${relative(dir, file)}:${line} ${message}`)
    .toSorted();
}

/* oxlint-disable tests/observe-behaviour -- the subject is biome.jsonc and its plugins, which lint() runs through the Biome CLI */
describe("tailwind-only-css", () => {
  it("allows Tailwind configuration in a stylesheet and flags hand-written CSS", () => {
    const css = [
      '@import "tailwindcss";',
      '@plugin "@tailwindcss/typography";',
      '@source "../pages";',
      "@custom-variant dark (&:where(.dark, .dark *));",
      "@theme { --color-x: red; @keyframes spin { to { rotate: 1turn; } } }",
      "@font-face { font-family: X; src: url(x.woff2); }",
      "@page { margin: 1cm; }",
      ".card { color: red; }",
      "@media print { .card { color: red; } }",
      "@layer base { h1 { color: red; } }",
      "@utility glow { color: red; }"
    ].join("\n");

    expect(lint({ "apps/site/src/styles/blog/post.css": css })).toEqual([
      "apps/site/src/styles/blog/post.css:10 Style with Tailwind",
      "apps/site/src/styles/blog/post.css:11 Every @utility lives in apps/site/src/styles/global.css, the one stylesheet to review.",
      "apps/site/src/styles/blog/post.css:8 Style with Tailwind",
      "apps/site/src/styles/blog/post.css:9 Style with Tailwind"
    ]);
  });

  it("lets global.css hold @utility and @layer base, but never @apply", () => {
    const css = [
      "@layer base { h1 { color: red; } }",
      "@utility glow { color: red; @media print { color: black; } }",
      "@utility ring { @apply p-2; }",
      "@layer components { .x { color: red; } }"
    ].join("\n");

    expect(lint({ "apps/site/src/styles/global.css": css })).toEqual([
      "apps/site/src/styles/global.css:3 No @apply",
      "apps/site/src/styles/global.css:4 Style with Tailwind"
    ]);
  });

  it("flags a <style> block in .astro even when it holds only Tailwind at-rules", () => {
    const astro = ["---", "---", "<p>x</p>", "<style>", "  @theme { --color-x: red; }", "</style>"];

    expect(lint({ "apps/site/src/components/Card.astro": astro.join("\n") })).toEqual([
      "apps/site/src/components/Card.astro:5 Style with Tailwind"
    ]);
  });
});

describe("cn-variants", () => {
  it("flags a ternary that picks between class sets inside cn(), and allows a plain cn()", () => {
    const astro = [
      "---",
      'import { cn } from "cn";',
      "const open = true;",
      "---",
      '<div class={cn("p-2", open && "m-1")}>a</div>',
      '<div class={cn("p-2", open ? "m-1" : "m-2")}>b</div>'
    ];

    expect(lint({ "apps/site/src/components/Menu.astro": astro.join("\n") })).toEqual([
      "apps/site/src/components/Menu.astro:6 Choosing between class sets is a variant, so use cva()."
    ]);
  });
});
/* oxlint-enable tests/observe-behaviour */
