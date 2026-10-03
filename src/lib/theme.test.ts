import { describe, expect, it } from "vitest";

import { resolveTheme, syncThemeOnRestore, type Theme, type ThemeSource } from "./theme";

describe("resolveTheme", () => {
  it("honours a stored choice over the OS preference", () => {
    expect(resolveTheme("true", false)).toBe("dark");
    expect(resolveTheme("false", true)).toBe("light");
  });

  it("falls back to the OS preference when nothing is stored", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  it("falls back to the OS preference when the stored value is not JSON", () => {
    expect(resolveTheme("{oops", true)).toBe("dark");
  });
});

describe("syncThemeOnRestore", () => {
  // the Workers pool has no PageTransitionEvent
  const show = (persisted: boolean) => Object.assign(new Event("pageshow"), { persisted });
  const source = (stored: string | null, current: Theme, prefersDark = false): ThemeSource => ({
    stored: () => stored,
    prefersDark: () => prefersDark,
    current: () => current
  });

  // The themes applied after a back/forward restore.
  const restore = (src: ThemeSource, persisted = true) => {
    const win = new EventTarget();
    const applied: Theme[] = [];
    syncThemeOnRestore(win, src, next => applied.push(next));
    win.dispatchEvent(show(persisted));
    return applied;
  };

  it("applies the stored choice only when the restored page shows the other theme", () => {
    expect(restore(source("true", "light"))).toEqual(["dark"]);
    expect(restore(source("false", "dark"))).toEqual(["light"]);
    expect(restore(source("true", "dark"))).toEqual([]);
  });

  it("follows the OS when nothing is stored", () => {
    expect(restore(source(null, "light", true))).toEqual(["dark"]);
    expect(restore(source(null, "dark", true))).toEqual([]);
  });

  it("leaves a fresh load alone (the bootstrap already ran)", () => {
    expect(restore(source("true", "light"), false)).toEqual([]);
    expect(restore(source("true", "light"), true)).toEqual(["dark"]);
  });
});
