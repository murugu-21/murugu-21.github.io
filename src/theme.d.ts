import type { Theme } from "./lib/theme";

// Set by the blog's pre-paint bootstrap in blog/layouts/BaseLayout.astro.
// Blog pages only, hence optional; lib/theme.ts's setTheme branches on it.
declare global {
  interface Window {
    __setPreferredTheme?: (theme: Theme) => void;
  }
}

export {};
