// The theme shared by both apps: one class, `html.dark-mode`, and one stored
// preference, localStorage "isDark" holding a JSON bool. Each layout paints the
// class before first paint from an inline bootstrap (layouts/Layout.astro,
// blog/layouts/BaseLayout.astro) that encodes the same rule as resolveTheme
// in its own words, because an `is:inline` script cannot import; both copies
// point back here. This module is that rule for everything that runs after
// paint.

export type Theme = "light" | "dark";

const THEME_KEY = "isDark";

/** The theme a document should show: the stored choice, else the OS's. */
export const resolveTheme = (stored: string | null, prefersDark: boolean): Theme => {
  if (stored !== null) {
    try {
      return JSON.parse(stored) ? "dark" : "light";
    } catch {
      // not ours — fall through to the OS preference
    }
  }
  return prefersDark ? "dark" : "light";
};

/** The theme the document is showing. */
export const currentTheme = (): Theme =>
  document.documentElement.classList.contains("dark-mode") ? "dark" : "light";

/**
 * Show `next` and remember it. Who owns the class differs by app: the blog's
 * bootstrap does, and exposes `__setPreferredTheme` (class, storage and the
 * `themechange` event in one); the portfolio has no owner beyond this, so it
 * writes the class and storage itself and fires the same event so listeners
 * (the toggle's label, the analytics tag) need not know which app they are in.
 */
export const setTheme = (next: Theme): void => {
  if (window.__setPreferredTheme) {
    window.__setPreferredTheme(next);
    return;
  }
  document.documentElement.classList.toggle("dark-mode", next === "dark");
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(next === "dark"));
  } catch {
    // storage blocked (private mode) — the class is still set for this visit
  }
  window.dispatchEvent(new Event("themechange"));
};

/** Where a document's theme comes from, as thunks so a sync reads live values. */
export interface ThemeSource {
  stored: () => string | null;
  prefersDark: () => boolean;
  current: () => Theme;
}

export const documentThemeSource: ThemeSource = {
  stored: () => {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  },
  prefersDark: () => matchMedia("(prefers-color-scheme: dark)").matches,
  current: currentTheme
};

/**
 * Catch up after a back/forward-cache restore. Going Back brings the page out
 * of the cache exactly as it was left, bootstrap and all, so a theme toggled on
 * the page in between is missing here: the class says one thing, storage the
 * other. `pageshow` with `persisted` is that restore (a fresh load has already
 * run the bootstrap); re-resolve the theme and apply it only if it differs.
 *
 * With nothing stored, `apply` (setTheme) persists the OS preference the page
 * catches up to, as the blog's bootstrap already does on an OS change: a page
 * that shows a theme remembers it.
 */
export const syncThemeOnRestore = (
  win: EventTarget,
  source: ThemeSource,
  apply: (next: Theme) => void
): void => {
  win.addEventListener("pageshow", e => {
    if (!(e as PageTransitionEvent).persisted) return;
    const next = resolveTheme(source.stored(), source.prefersDark());
    if (next !== source.current()) apply(next);
  });
};
