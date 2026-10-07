import astro from "eslint-plugin-astro";
import { defineConfig } from "eslint/config";

// Covers .astro templates until oxlint can parse them (README.md › Checks).
export default defineConfig([astro.configs.recommended, astro.configs["jsx-a11y-recommended"]]);
