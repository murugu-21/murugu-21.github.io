// Theme for both apps: class `html.dark-mode`, localStorage "isDark" ("true" or
// "false"), set through `window.__setPreferredTheme`.

export type Theme = "light" | "dark";

interface ThemeHost extends Pick<Window, "addEventListener" | "dispatchEvent"> {
  document: Pick<Document, "documentElement">;
  localStorage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  matchMedia: (query: string) => Pick<MediaQueryList, "matches" | "addEventListener">;
  __setPreferredTheme: (theme: Theme) => void;
}

/**
 * Applies the stored choice, else the OS's, before first paint, then owns
 * every later change: `__setPreferredTheme` for the toggle, an OS flip (which
 * drops the stored choice, so the site follows the OS again), and a bfcache
 * restore (which skips inline scripts). Both layouts inline its source as
 * `themeBootstrapScript`, so it must not reference anything outside itself.
 */
export function bootstrapTheme(win: ThemeHost): void {
  const key = "isDark";
  const root = win.document.documentElement;
  const os = win.matchMedia("(prefers-color-scheme: dark)");
  const osTheme = (): Theme => (os.matches ? "dark" : "light");

  const resolve = (): Theme => {
    try {
      const stored = win.localStorage.getItem(key);
      if (stored === "true" || stored === "false") return stored === "true" ? "dark" : "light";
    } catch {
      // storage blocked; fall through to the OS preference
    }
    return osTheme();
  };
  const apply = (theme: Theme) => root.classList.toggle("dark-mode", theme === "dark");
  apply(resolve());

  const announce = (theme: Theme) => {
    apply(theme);
    win.dispatchEvent(new Event("themechange"));
  };
  // storage blocked (private mode): the class still applies this visit
  const store = (write: () => void) => {
    try {
      write();
    } catch {}
  };

  win.__setPreferredTheme = theme => {
    store(() => win.localStorage.setItem(key, JSON.stringify(theme === "dark")));
    announce(theme);
  };
  os.addEventListener("change", () => {
    store(() => win.localStorage.removeItem(key));
    announce(osTheme());
  });
  win.addEventListener("pageshow", e => {
    if (!e.persisted) return;
    const next = resolve();
    if (next !== (root.classList.contains("dark-mode") ? "dark" : "light")) announce(next);
  });
}

export const themeBootstrapScript = `(${bootstrapTheme.toString()})(window);`;

export const currentTheme = (): Theme =>
  document.documentElement.classList.contains("dark-mode") ? "dark" : "light";
