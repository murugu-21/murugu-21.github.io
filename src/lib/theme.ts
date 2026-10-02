// Theme for both apps: class `html.dark-mode`, localStorage "isDark" (JSON
// bool). The layouts' inline pre-paint bootstraps duplicate resolveTheme
// because `is:inline` scripts cannot import; keep them in sync.

export type Theme = "light" | "dark";

const THEME_KEY = "isDark";

/** The stored choice, else the OS's. */
export const resolveTheme = (stored: string | null, prefersDark: boolean): Theme => {
  if (stored !== null) {
    try {
      return JSON.parse(stored) ? "dark" : "light";
    } catch {
      // not ours; fall through to the OS preference
    }
  }
  return prefersDark ? "dark" : "light";
};

export const currentTheme = (): Theme =>
  document.documentElement.classList.contains("dark-mode") ? "dark" : "light";

/**
 * On the blog, delegate to the bootstrap's `__setPreferredTheme`; on the
 * portfolio, write class and storage here and fire the same `themechange`.
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
    // storage blocked (private mode); the class still applies this visit
  }
  window.dispatchEvent(new Event("themechange"));
};

/** Thunks so a sync reads live values. */
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
 * A bfcache restore skips the bootstrap, so a theme toggled on another page is
 * missing; re-resolve on `pageshow` (persisted) and apply only if it differs.
 * With nothing stored, `apply` persists the OS preference, like the blog does.
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
