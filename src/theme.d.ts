// The blog's theme is owned by the blocking bootstrap script in
// blog/layouts/BaseLayout.astro, which runs before first paint and hangs these
// two globals off window. They exist on blog pages only — the portfolio owns
// `html.dark-mode` directly — so both are optional, and the shared
// components/ThemeToggle.astro branches on that.
declare global {
  interface Window {
    __theme?: "light" | "dark";
    __setPreferredTheme?: (theme: "light" | "dark") => void;
  }
}

export {};
