import {defineConfig} from "astro/config";
import {FontaineTransform} from "fontaine";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://murugappan.dev",
  output: "static",
  build: {assets: "static"},
  integrations: [react()],
  vite: {
    plugins: [
      // Tailwind is scoped to the chat widget island (see chat.css — theme +
      // utilities only, no preflight, so it can't touch the site's SCSS).
      tailwindcss(),
      FontaineTransform.vite({
        fallbacks: ["Arial", "Georgia"],
        // @font-face src urls are relative to global.scss
        resolvePath: id => new URL("./src/styles/" + id, import.meta.url)
      })
    ]
  }
});
