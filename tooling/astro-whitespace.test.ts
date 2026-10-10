import { globSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { spacingMistakes } from "./astro-whitespace.ts";

const ROOT = resolve(import.meta.dirname, "..");

const template = `---
const n = 3;
---
<p>
  It is metered at
  {n} requests a day. The <a href="/developers/">developer portal</a>
  documents the endpoints, and <code>initialize</code>
  -based revisions still work.{" "}
  <a href="/blog/"> blog</a> or <em>more </em>. See (
  <a href="/rfc/">RFC 9745</a>). Headers: <code>Limit</code>
  <code>Remaining</code>.
</p>
<p>{n > 1 && <span> · Part-time</span>}</p>
<pre>keeps
  <code>its</code>
  whitespace</pre>`;

describe("spacingMistakes", () => {
  it("finds line breaks that join words and spaces that pad an inline element, and nothing in the site's templates", () => {
    expect(spacingMistakes(template)).toEqual([
      { line: 5, text: "It is metered at", kind: "joins words" },
      { line: 7, text: "documents the endpoints, and", kind: "joins words" },
      { line: 9, text: "blog", kind: "pads element" },
      { line: 9, text: "more", kind: "pads element" },
      { line: 11, text: "before <code>", kind: "joins words" }
    ]);

    const files = globSync("apps/site/src/**/*.astro", { cwd: ROOT });
    expect(files.length, "the glob found the site's templates").toBeGreaterThan(40);
    const site = files.flatMap(file =>
      spacingMistakes(readFileSync(join(ROOT, file), "utf8")).map(
        m => `${file}:${m.line} ${m.kind}: ${m.text}`
      )
    );
    expect(site, 'write the space as {" "} or keep the words on one line').toEqual([]);
  });
});
