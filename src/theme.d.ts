import type { Theme } from "./lib/theme";

// The blog's theme is owned by the blocking bootstrap script in
// blog/layouts/BaseLayout.astro, which runs before first paint and hangs these
// two globals off window. They exist on blog pages only — the portfolio owns
// `html.dark-mode` directly — so both are optional, and lib/theme.ts's
// setTheme branches on that.
declare global {
  interface Window {
    __theme?: Theme;
    __setPreferredTheme?: (theme: Theme) => void;
  }
}

export {};
