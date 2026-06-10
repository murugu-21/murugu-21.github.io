import { defineConfig } from "astro/config";
import { FontaineTransform } from "fontaine";

export default defineConfig({
  site: "https://murugappan.dev",
  output: "static",
  build: { assets: "static" },
  vite: {
    plugins: [
      FontaineTransform.vite({
        fallbacks: ["Arial", "Georgia"],
        // @font-face src urls are relative to global.scss
        resolvePath: (id) => new URL("./src/styles/" + id, import.meta.url),
      }),
    ],
  },
});
