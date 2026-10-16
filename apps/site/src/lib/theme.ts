export type Theme = "light" | "dark";

interface ThemeHost extends Pick<Window, "addEventListener" | "dispatchEvent"> {
  document: Pick<Document, "documentElement">;
  localStorage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  matchMedia: (query: string) => Pick<MediaQueryList, "matches" | "addEventListener">;
  __setPreferredTheme: (theme: Theme) => void;
}

// Layout.astro inlines this via toString() as themeBootstrapScript, so it must not reference
// anything outside itself.
export function bootstrapTheme(win: ThemeHost): void {
  const key = "isDark";
  const root = win.document.documentElement;
  const os = win.matchMedia("(prefers-color-scheme: dark)");
  const osTheme = (): Theme => (os.matches ? "dark" : "light");

  const storedThemes = new Map<string | null, Theme>([
    ["true", "dark"],
    ["false", "light"]
  ]);
  const resolve = (): Theme => {
    try {
      return storedThemes.get(win.localStorage.getItem(key)) ?? osTheme();
    } catch {
      return osTheme();
    }
  };
  const shown = (): Theme => (root.classList.contains("dark-mode") ? "dark" : "light");
  const apply = (theme: Theme) => root.classList.toggle("dark-mode", theme === "dark");
  apply(resolve());

  const announce = (theme: Theme) => {
    apply(theme);
    win.dispatchEvent(new Event("themechange"));
  };
  const store = (write: () => void) => {
    try {
      write();
    } catch {
      // Storage blocked (private mode): the class still applies this visit.
    }
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
    if (next !== shown()) announce(next);
  });
}

export const themeBootstrapScript = `(${bootstrapTheme.toString()})(window);`;

export const currentTheme = (): Theme =>
  document.documentElement.classList.contains("dark-mode") ? "dark" : "light";
