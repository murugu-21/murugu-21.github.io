// TypeScript 7 dropped the JS compiler API that typescript-eslint loads via
// require("typescript"). This preload, used by lint:astro, redirects it to the
// `@typescript/typescript6` compat package. Delete this file and that
// devDependency once typescript-eslint supports TypeScript 7.
const Module = require("node:module");

const resolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, ...args) {
  if (request === "typescript" || request.startsWith("typescript/")) {
    request = "@typescript/typescript6" + request.slice("typescript".length);
  }
  return resolveFilename.call(this, request, ...args);
};
