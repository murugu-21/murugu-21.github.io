import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://murugappan.dev",
  output: "static",
  build: { assets: "static" },
});
