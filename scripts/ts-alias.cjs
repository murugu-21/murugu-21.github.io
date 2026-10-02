// TypeScript 7 dropped the JS compiler API that Volar (and so `astro check`)
// hardcodes via require("typescript"). This preload, used only by
// check:astro, redirects it to the `@typescript/typescript6` compat package.
// Delete this file, that devDependency and the `typescript` override in
// package.json once @astrojs/check supports TypeScript 7.
const Module = require("node:module");

const resolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, ...args) {
  if (request === "typescript" || request.startsWith("typescript/")) {
    request = "@typescript/typescript6" + request.slice("typescript".length);
  }
  return resolveFilename.call(this, request, ...args);
};
