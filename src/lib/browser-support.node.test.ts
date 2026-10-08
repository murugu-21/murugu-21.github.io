// Node project: ESLint's Linter loads neither in the Workers pool nor in the browser.
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import { continueLinkScript, outdatedRedirectScript } from "./browser-support";

// They run in browsers far older than the floor, where newer syntax would stop them silently.
describe("the inlined scripts", () => {
  const es5Errors = (code: string) =>
    new Linter()
      .verify(code, { languageOptions: { ecmaVersion: 5, sourceType: "script" } })
      .map(error => error.message);

  it("parse as ES5, which rejects an arrow function", () => {
    expect(es5Errors(outdatedRedirectScript)).toEqual([]);
    expect(es5Errors(continueLinkScript)).toEqual([]);
    expect(es5Errors("var f = () => 1;")).toHaveLength(1);
  });
});
