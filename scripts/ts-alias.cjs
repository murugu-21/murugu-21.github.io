// TypeScript 7's native compiler dropped the old JS compiler API: `typescript`
// now resolves to `lib/version.cjs`, so anything reaching for
// `require("typescript").sys` — Volar, and through it `astro check` — crashes.
// Astro's language tooling has no TypeScript 7 build yet.
//
// Microsoft publishes that old API as `@typescript/typescript6` for exactly
// this overlap. Volar hardcodes `require("typescript")` rather than accepting
// an injected compiler, so this preload points the CJS resolver at the compat
// package for the duration of `npm run check:astro`. Everything else — tsc,
// check:src, check:worker, the editor — uses the real TypeScript 7.
//
// Delete this file, the `@typescript/typescript6` devDependency, and the
// `@astrojs/check` override once @astrojs/check supports TypeScript 7.
const Module = require("node:module");

const resolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, ...args) {
  if (request === "typescript" || request.startsWith("typescript/")) {
    request = "@typescript/typescript6" + request.slice("typescript".length);
  }
  return resolveFilename.call(this, request, ...args);
};
