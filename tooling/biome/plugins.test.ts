import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { text } from "node:stream/consumers";

import { afterAll, describe, expect, it } from "vite-plus/test";

const ROOT = resolve(import.meta.dirname, "../..");
const BIOME = join(ROOT, "node_modules/.bin/biome");

// Biome reports real paths, and macOS links the temp folder from /var to /private/var.
const work = await realpath(await mkdtemp(join(tmpdir(), "biome-plugins-")));
afterAll(() => rm(work, { recursive: true, force: true }));

async function lint(files: Record<string, string>): Promise<string[]> {
  const dir = await mkdtemp(join(work, "case-"));
  await cp(join(ROOT, "biome.jsonc"), join(dir, "biome.jsonc"));
  await cp(join(ROOT, "tooling/biome"), join(dir, "tooling/biome"), { recursive: true });
  for (const [path, source] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), source);
  }
  const stdout = await text(
    spawn(BIOME, ["lint", "--reporter=github"], { cwd: dir, stdio: ["ignore", "pipe", "ignore"] })
      .stdout
  );
  return [...stdout.matchAll(/^::error title=plugin,file=(.+?),line=(\d+),.*?::([^:\n]+)/gm)]
    .map(([, file = "", line, message]) => `${relative(dir, file)}:${line} ${message}`)
    .toSorted();
}

/* oxlint-disable tests/observe-behaviour -- the subject is biome.jsonc and its plugins, which lint() runs through the Biome CLI */
describe.concurrent("tailwind-only-css", () => {
  it("allows Tailwind configuration in a stylesheet and flags hand-written CSS", async () => {
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

    expect(await lint({ "apps/site/src/styles/blog/post.css": css })).toEqual([
      "apps/site/src/styles/blog/post.css:10 Style with Tailwind",
      "apps/site/src/styles/blog/post.css:11 Every @utility lives in apps/site/src/styles/global.css, the one stylesheet to review.",
      "apps/site/src/styles/blog/post.css:8 Style with Tailwind",
      "apps/site/src/styles/blog/post.css:9 Style with Tailwind"
    ]);
  });

  it("lets global.css hold @utility and @layer base, but never @apply", async () => {
    const css = [
      "@layer base { h1 { color: red; } }",
      "@utility glow { color: red; @media print { color: black; } }",
      "@utility ring { @apply p-2; }",
      "@layer components { .x { color: red; } }"
    ].join("\n");

    expect(await lint({ "apps/site/src/styles/global.css": css })).toEqual([
      "apps/site/src/styles/global.css:3 No @apply",
      "apps/site/src/styles/global.css:4 Style with Tailwind"
    ]);
  });

  it("flags a <style> block in .astro even when it holds only Tailwind at-rules", async () => {
    const astro = ["---", "---", "<p>x</p>", "<style>", "  @theme { --color-x: red; }", "</style>"];

    expect(await lint({ "apps/site/src/components/Card.astro": astro.join("\n") })).toEqual([
      "apps/site/src/components/Card.astro:5 Style with Tailwind"
    ]);
  });
});

describe.concurrent("cn-variants", () => {
  it("flags a ternary that picks between class sets inside cn(), and allows a plain cn()", async () => {
    const astro = [
      "---",
      'import { cn } from "cn";',
      "const open = true;",
      "---",
      '<div class={cn("p-2", open && "m-1")}>a</div>',
      '<div class={cn("p-2", open ? "m-1" : "m-2")}>b</div>'
    ];

    expect(await lint({ "apps/site/src/components/Menu.astro": astro.join("\n") })).toEqual([
      "apps/site/src/components/Menu.astro:6 Choosing between class sets is a variant, so use cva()."
    ]);
  });
});
/* oxlint-enable tests/observe-behaviour */
