import { runInNewContext } from "node:vm";

import { Linter } from "eslint";
import { describe, expect, it } from "vite-plus/test";

import { inlineScript, type InlineScript } from "./inline-script";
import { continueLinkScript, outdatedRedirectScript } from "./outdated-browser";
import { sharedElementScript } from "./shared-elements";
import { themeBootstrapScript } from "./theme-bootstrap";

const PAGE_GLOBALS = { window: "readonly", Event: "readonly", URL: "readonly" } as const;

const problems = ({
  script: { source, syntax },
  globals = PAGE_GLOBALS
}: {
  script: InlineScript;
  globals?: Record<string, "readonly">;
}) =>
  new Linter()
    .verify(source, {
      languageOptions: {
        ecmaVersion: syntax === "es5" ? 5 : "latest",
        sourceType: "script",
        globals
      },
      rules: { "no-undef": "error" }
    })
    .map(problem => problem.message);

const isInlineScript = (value: unknown): value is InlineScript =>
  typeof value === "object" &&
  value !== null &&
  "source" in value &&
  typeof value.source === "string" &&
  "syntax" in value;

const shipped = Object.entries(
  import.meta.glob<object>(["./*.ts", "!./*.test.ts", "!./inline-script.ts"], {
    eager: true
  })
).flatMap(([file, exports]) =>
  Object.entries(exports).flatMap(([name, value]) =>
    isInlineScript(value) ? [{ name: `${file} ${name}`, script: value }] : []
  )
);

describe("every script this folder inlines", () => {
  it("includes each script the pages ship", () => {
    const found = shipped.map(({ script }) => script);
    for (const script of [
      outdatedRedirectScript,
      continueLinkScript,
      themeBootstrapScript,
      sharedElementScript
    ]) {
      expect(found).toContain(script);
    }
  });

  it.each(shipped)(
    "$name reaches nothing but window outside its own body and parses as its syntax",
    ({ script }) => {
      expect(problems({ script })).toEqual([]);
      expect(problems({ script, globals: {} })).toContain("'window' is not defined.");
    }
  );
});

const outside = "module scope";

describe("inlineScript", () => {
  it("calls the function's own source with window and the arguments as JSON", () => {
    const script = inlineScript({
      run: function greet(win: { greeting: string }, name: string) {
        return win.greeting + ", " + name;
      },
      args: ['"Ada"'],
      syntax: "es5"
    });
    expect(runInNewContext(script.source, { window: { greeting: "Hello" } })).toBe('Hello, "Ada"');
  });

  it("is caught reaching a binding outside the function or syntax past its target", () => {
    const leaky = inlineScript({
      run: (win: { name: string }) => {
        win.name = outside;
      },
      args: [],
      syntax: "latest"
    });
    const modern = inlineScript({
      run: (win: { name: string }) => {
        win.name = "";
      },
      args: [],
      syntax: "es5"
    });
    expect(problems({ script: leaky })).toEqual(["'outside' is not defined."]);
    expect(problems({ script: modern })).toEqual(["Parsing error: Unexpected token >"]);
  });
});
