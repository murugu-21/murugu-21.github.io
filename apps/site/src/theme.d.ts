import type { Theme } from "./lib/theme";

// Set by bootstrapTheme (lib/theme.ts), which Layout.astro inlines in <head>.
declare global {
  interface Window {
    __setPreferredTheme: (theme: Theme) => void;
  }
}

export {};
