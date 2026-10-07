import { describe, expect, it } from "vitest";

import { modulePreloader } from "./module-preload.ts";

// A built site's modules by root-relative href.
const MODULES: Record<string, string> = {
  "/static/page.js": 'import { a } from "./chunks/a.js";import("./lazy.js");',
  "/static/chunks/a.js": 'import "./b.js";export { b } from "./b.js";import "./missing.js";',
  "/static/chunks/b.js": 'import { page } from "../page.js";export const b = 1;',
  "/static/other.js": 'import"./page.js";import{a}from"./chunks/a.js";',
  "/static/leaf.js": "export const leaf = 1;"
};

const read = (href: string) => MODULES[href];

describe("modulePreloader", () => {
  it("hints every static import the page's module scripts reach, before the first one", () => {
    const addHints = modulePreloader(read);
    expect(
      addHints(
        '<head><title>x</title><script type="module" src="/static/page.js"></script></head>' +
          '<body><script type="module" src="/static/other.js"></script></body>'
      )
    ).toBe(
      "<head><title>x</title>" +
        '<link rel="modulepreload" href="/static/chunks/a.js">' +
        '<link rel="modulepreload" href="/static/chunks/b.js">' +
        '<link rel="modulepreload" href="/static/chunks/missing.js">' +
        '<script type="module" src="/static/page.js"></script></head>' +
        '<body><script type="module" src="/static/other.js"></script></body>'
    );
  });

  it("returns undefined when there is nothing to hint, and hints an import another page loads as its entry", () => {
    const addHints = modulePreloader(read);
    expect(addHints('<script type="module" src="/static/leaf.js"></script>')).toBeUndefined();
    expect(addHints("<p>no scripts</p>")).toBeUndefined();
    expect(addHints('<script type="module" src="/static/other.js"></script>')).toBe(
      '<link rel="modulepreload" href="/static/page.js">' +
        '<link rel="modulepreload" href="/static/chunks/a.js">' +
        '<link rel="modulepreload" href="/static/chunks/b.js">' +
        '<link rel="modulepreload" href="/static/chunks/missing.js">' +
        '<script type="module" src="/static/other.js"></script>'
    );
  });
});
