import { describe, expect, it, vi } from "vitest";

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
  // The Workers pool has no PageTransitionEvent; the implementation reads the
  // one own property a real restore sets.
  const show = (persisted: boolean) => Object.assign(new Event("pageshow"), { persisted });
  const source = (stored: string | null, current: Theme, prefersDark = false): ThemeSource => ({
    stored: () => stored,
    prefersDark: () => prefersDark,
    current: () => current
  });

  const restore = (src: ThemeSource, persisted = true) => {
    const win = new EventTarget();
    const apply = vi.fn();
    syncThemeOnRestore(win, src, apply);
    win.dispatchEvent(show(persisted));
    return apply;
  };

  it("applies the stored choice when the restored page shows the other theme", () => {
    expect(restore(source("true", "light")).mock.calls).toEqual([["dark"]]);
    expect(restore(source("false", "dark")).mock.calls).toEqual([["light"]]);
  });

  it("does nothing when the restored page already shows the stored choice", () => {
    expect(restore(source("true", "dark"))).not.toHaveBeenCalled();
  });

  it("follows the OS when nothing is stored", () => {
    expect(restore(source(null, "light", true)).mock.calls).toEqual([["dark"]]);
    expect(restore(source(null, "dark", true))).not.toHaveBeenCalled();
  });

  it("leaves a fresh load alone (the bootstrap already ran)", () => {
    expect(restore(source("true", "light"), false)).not.toHaveBeenCalled();
  });
});
